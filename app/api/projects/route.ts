import { Prisma, ProjectBillingType, ProjectStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const createProjectSchema = z
  .object({
    customerId: z.string().cuid(),
    navn: z.string().trim().min(2).max(150),
    beskrivelse: z
      .string()
      .trim()
      .max(4000)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    adresse: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    status: z.nativeEnum(ProjectStatus).default(ProjectStatus.PLANLAGT),
    billingType: z.nativeEnum(ProjectBillingType).default(ProjectBillingType.TIME),
    startDato: dateStringSchema,
    sluttDato: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    fastprisBelopEksMva: z.number().min(0).refine(Number.isFinite).nullable().optional().default(null),
    timeprisEksMva: z.number().min(0).refine(Number.isFinite).nullable().optional().default(null)
  })
  .superRefine((data, context) => {
    if (data.billingType === ProjectBillingType.FASTPRIS && (!data.fastprisBelopEksMva || data.fastprisBelopEksMva <= 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fastprisBelopEksMva"],
        message: "Fastpris ma settes nar billing type er FASTPRIS."
      });
    }

    if (data.sluttDato && !dateStringSchema.safeParse(data.sluttDato).success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sluttDato"],
        message: "Ugyldig sluttdato."
      });
    }

    if (data.sluttDato && dateStringSchema.safeParse(data.sluttDato).success) {
      const start = new Date(`${data.startDato}T00:00:00`);
      const slutt = new Date(`${data.sluttDato}T00:00:00`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(slutt.getTime()) && slutt < start) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sluttDato"],
          message: "Sluttdato kan ikke vaere for startdato."
        });
      }
    }
  });

function normalizeSingle(value: string | null): string {
  return value?.trim() ?? "";
}

function getStatusFilter(value: string): "ALL" | ProjectStatus {
  if (
    value === ProjectStatus.PLANLAGT ||
    value === ProjectStatus.PAGAR ||
    value === ProjectStatus.FERDIG ||
    value === ProjectStatus.FAKTURERT
  ) {
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

function toProjectMutationData(data: z.infer<typeof createProjectSchema>) {
  return {
    customerId: data.customerId,
    navn: data.navn,
    beskrivelse: data.beskrivelse,
    adresse: data.adresse,
    status: data.status,
    billingType: data.billingType,
    fastprisBelopEksMva: data.billingType === ProjectBillingType.FASTPRIS ? data.fastprisBelopEksMva : null,
    timeprisEksMva: data.timeprisEksMva ?? null,
    startDato: new Date(`${data.startDato}T00:00:00`),
    sluttDato: data.sluttDato ? new Date(`${data.sluttDato}T00:00:00`) : null
  };
}

export async function GET(request: Request) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const url = new URL(request.url);
  const query = normalizeSingle(url.searchParams.get("q"));
  const status = getStatusFilter(normalizeSingle(url.searchParams.get("status")).toUpperCase());
  const customerId = normalizeSingle(url.searchParams.get("customerId"));

  const where: Prisma.ProjectWhereInput = {};
  if (status !== "ALL") {
    where.status = status;
  }
  if (customerId) {
    where.customerId = customerId;
  }
  if (query.length > 0) {
    where.OR = [{ navn: { contains: query, mode: "insensitive" } }, { customer: { navn: { contains: query, mode: "insensitive" } } }];
  }

  const projects = await db.project.findMany({
    where,
    orderBy: [{ status: "asc" }, { startDato: "desc" }],
    include: {
      customer: {
        select: {
          id: true,
          navn: true
        }
      }
    }
  });

  return NextResponse.json({ data: projects });
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
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const created = await db.project.create({
      data: toProjectMutationData(parsed.data)
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_CREATED",
      entityType: "PROJECT",
      entityId: created.id,
      ipAddress: getRequestIp(request),
      metadata: { navn: created.navn, status: created.status, billingType: created.billingType }
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Klarte ikke opprette prosjekt" }, { status: 500 });
  }
}
