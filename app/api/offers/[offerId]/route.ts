import { OfferHistoryAction, OfferStatus, OfferType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { calculateOfferTotals, DEFAULT_MVA_PERCENT } from "@/lib/offer-calculation";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  offerId: z.string().cuid()
});

const updateOfferSchema = z.object({
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
  specificationItems: z
    .array(
      z.object({
        tekst: z.string().trim().min(1).max(300),
        belopEksMva: z.number().min(0).max(100000000).nullable().optional().default(null)
      })
    )
    .max(200)
    .optional()
    .default([])
});

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function GET(_request: Request, context: { params: Promise<{ offerId: string }> }) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig tilbud-id" }, { status: 400 });
  }

  const offer = await db.offer.findUnique({
    where: { id: parsedParams.data.offerId },
    include: {
      customer: {
        select: {
          id: true,
          navn: true,
          epost: true,
          telefon: true,
          adresse: true,
          postnr: true,
          poststed: true
        }
      },
      project: {
        select: {
          id: true,
          navn: true,
          status: true
        }
      },
      specificationItems: {
        orderBy: { rekkefolge: "asc" }
      },
      history: {
        orderBy: { createdAt: "desc" },
        include: {
          changedBy: {
            select: { id: true, name: true, email: true }
          }
        }
      }
    }
  });

  if (!offer) {
    return NextResponse.json({ error: "Tilbud ikke funnet" }, { status: 404 });
  }

  return NextResponse.json({ data: offer });
}

export async function PATCH(request: Request, context: { params: Promise<{ offerId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig tilbud-id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = updateOfferSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  const existing = await db.offer.findUnique({
    where: { id: parsedParams.data.offerId },
    select: { id: true, status: true }
  });

  if (!existing) {
    return NextResponse.json({ error: "Tilbud ikke funnet" }, { status: 404 });
  }

  if (existing.status !== OfferStatus.UTKAST) {
    return NextResponse.json({ error: "Kun utkast kan redigeres" }, { status: 409 });
  }

  const totals = calculateOfferTotals({
    timeEstimateHours: parsedBody.data.timeEstimateHours,
    hourlyRateEksMva: parsedBody.data.hourlyRateEksMva,
    materialCostEksMva: parsedBody.data.materialCostEksMva,
    markupPercent: parsedBody.data.markupPercent,
    riskBufferPercent: parsedBody.data.riskBufferPercent,
    mvaPercent: parsedBody.data.mvaPercent
  });

  try {
    const updated = await db.offer.update({
      where: { id: existing.id },
      data: {
        customerId: parsedBody.data.customerId,
        navn: parsedBody.data.navn,
        beskrivelse: parsedBody.data.beskrivelse,
        offerType: parsedBody.data.offerType,
        timeEstimateHours: parsedBody.data.timeEstimateHours,
        hourlyRateEksMva: parsedBody.data.hourlyRateEksMva,
        materialCostEksMva: parsedBody.data.materialCostEksMva,
        markupPercent: parsedBody.data.markupPercent,
        riskBufferPercent: parsedBody.data.riskBufferPercent,
        subtotalEksMva: totals.subtotalEksMva,
        markupAmountEksMva: totals.markupAmountEksMva,
        riskAmountEksMva: totals.riskAmountEksMva,
        totalEksMva: totals.totalEksMva,
        mvaPercent: parsedBody.data.mvaPercent,
        totalInkMva: totals.totalInkMva,
        updatedById: session.user.id,
        specificationItems: {
          deleteMany: {},
          create: parsedBody.data.specificationItems.map((item, index) => ({
            tekst: item.tekst,
            belopEksMva: item.belopEksMva,
            rekkefolge: index + 1
          }))
        },
        history: {
          create: {
            changedById: session.user.id,
            action: OfferHistoryAction.UPDATED,
            fromStatus: existing.status,
            toStatus: existing.status,
            snapshot: {
              customerId: parsedBody.data.customerId,
              navn: parsedBody.data.navn,
              offerType: parsedBody.data.offerType,
              status: existing.status,
              totals
            }
          }
        }
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "OFFER_UPDATED",
      entityType: "OFFER",
      entityId: updated.id,
      ipAddress: getRequestIp(request),
      metadata: { navn: updated.navn, status: updated.status, offerType: updated.offerType, totalEksMva: updated.totalEksMva }
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Klarte ikke oppdatere tilbud" }, { status: 500 });
  }
}
