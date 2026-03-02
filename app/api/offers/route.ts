import { OfferStatus, OfferType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { calculateOfferTotals, DEFAULT_MVA_PERCENT } from "@/lib/offer-calculation";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const specificationItemSchema = z.object({
  tekst: z.string().trim().min(1).max(300),
  belopEksMva: z.number().min(0).max(100000000).nullable().optional().default(null)
});

const createOfferSchema = z.object({
  customerId: z.string().cuid(),
  navn: z.string().trim().min(2).max(160),
  beskrivelse: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  offerType: z.nativeEnum(OfferType),
  timeEstimateHours: z.number().min(0).max(10000),
  hourlyRateEksMva: z.number().min(0).max(1000000),
  materialCostEksMva: z.number().min(0).max(100000000).default(0),
  markupPercent: z.number().min(0).max(500).default(0),
  riskBufferPercent: z.number().min(0).max(500).default(0),
  mvaPercent: z.number().min(0).max(100).default(DEFAULT_MVA_PERCENT),
  specificationItems: z.array(specificationItemSchema).max(200).optional().default([])
});

function normalizeSingle(value: string | null): string {
  return value?.trim() ?? "";
}

function getStatusFilter(value: string): "ALL" | OfferStatus {
  if (value === OfferStatus.UTKAST || value === OfferStatus.SENDT || value === OfferStatus.GODKJENT || value === OfferStatus.AVVIST) {
    return value;
  }
  return "ALL";
}

function getTypeFilter(value: string): "ALL" | OfferType {
  if (value === OfferType.FASTPRIS || value === OfferType.TIMEBASERT) {
    return value;
  }
  return "ALL";
}

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function GET(request: Request) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const url = new URL(request.url);
  const query = normalizeSingle(url.searchParams.get("q"));
  const status = getStatusFilter(normalizeSingle(url.searchParams.get("status")).toUpperCase());
  const offerType = getTypeFilter(normalizeSingle(url.searchParams.get("offerType")).toUpperCase());
  const customerId = normalizeSingle(url.searchParams.get("customerId"));

  const where: Prisma.OfferWhereInput = {};
  if (status !== "ALL") {
    where.status = status;
  }
  if (offerType !== "ALL") {
    where.offerType = offerType;
  }
  if (customerId) {
    where.customerId = customerId;
  }
  if (query.length > 0) {
    where.OR = [
      { navn: { contains: query, mode: "insensitive" } },
      { customer: { navn: { contains: query, mode: "insensitive" } } }
    ];
  }

  const offers = await db.offer.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    include: {
      customer: {
        select: {
          id: true,
          navn: true
        }
      },
      project: {
        select: {
          id: true,
          navn: true
        }
      }
    }
  });

  return NextResponse.json({ data: offers });
}

export async function POST(request: Request) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createOfferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const totals = calculateOfferTotals({
    timeEstimateHours: parsed.data.timeEstimateHours,
    hourlyRateEksMva: parsed.data.hourlyRateEksMva,
    materialCostEksMva: parsed.data.materialCostEksMva,
    markupPercent: parsed.data.markupPercent,
    riskBufferPercent: parsed.data.riskBufferPercent,
    mvaPercent: parsed.data.mvaPercent
  });

  try {
    const created = await db.offer.create({
      data: {
        customerId: parsed.data.customerId,
        navn: parsed.data.navn,
        beskrivelse: parsed.data.beskrivelse,
        offerType: parsed.data.offerType,
        status: OfferStatus.UTKAST,
        timeEstimateHours: parsed.data.timeEstimateHours,
        hourlyRateEksMva: parsed.data.hourlyRateEksMva,
        materialCostEksMva: parsed.data.materialCostEksMva,
        markupPercent: parsed.data.markupPercent,
        riskBufferPercent: parsed.data.riskBufferPercent,
        subtotalEksMva: totals.subtotalEksMva,
        markupAmountEksMva: totals.markupAmountEksMva,
        riskAmountEksMva: totals.riskAmountEksMva,
        totalEksMva: totals.totalEksMva,
        mvaPercent: parsed.data.mvaPercent,
        totalInkMva: totals.totalInkMva,
        createdById: session.user.id,
        updatedById: session.user.id,
        specificationItems: {
          create: parsed.data.specificationItems.map((item, index) => ({
            tekst: item.tekst,
            belopEksMva: item.belopEksMva,
            rekkefolge: index + 1
          }))
        },
        history: {
          create: {
            changedById: session.user.id,
            action: "CREATED",
            toStatus: OfferStatus.UTKAST,
            snapshot: {
              customerId: parsed.data.customerId,
              navn: parsed.data.navn,
              offerType: parsed.data.offerType,
              status: OfferStatus.UTKAST,
              totals
            }
          }
        }
      },
      include: {
        customer: {
          select: {
            id: true,
            navn: true
          }
        }
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "OFFER_CREATED",
      entityType: "OFFER",
      entityId: created.id,
      ipAddress: getRequestIp(request),
      metadata: { navn: created.navn, status: created.status, offerType: created.offerType, totalEksMva: created.totalEksMva }
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Klarte ikke opprette tilbud" }, { status: 500 });
  }
}
