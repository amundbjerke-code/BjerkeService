import { CustomerStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const createCustomerSchema = z.object({
  navn: z.string().trim().min(2).max(120),
  orgnr: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  epost: z.string().trim().email().max(200),
  telefon: z.string().trim().min(5).max(40),
  adresse: z.string().trim().min(2).max(200),
  postnr: z.string().trim().min(2).max(12),
  poststed: z.string().trim().min(2).max(120),
  notater: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

function normalizeSingle(value: string | null): string {
  return value?.trim() ?? "";
}

function getStatusFilter(value: string): "ALL" | CustomerStatus {
  if (value === CustomerStatus.ACTIVE || value === CustomerStatus.INACTIVE) {
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

  const where: Prisma.CustomerWhereInput = {};
  if (status !== "ALL") {
    where.status = status;
  }
  if (query.length > 0) {
    where.OR = [
      { navn: { contains: query, mode: "insensitive" } },
      { telefon: { contains: query, mode: "insensitive" } },
      { epost: { contains: query, mode: "insensitive" } }
    ];
  }

  const customers = await db.customer.findMany({
    where,
    orderBy: [{ status: "asc" }, { navn: "asc" }]
  });

  return NextResponse.json({ data: customers });
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
  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const created = await db.customer.create({
    data: parsed.data
  });

  await logAudit({
    actorId: session.user.id,
    action: "CUSTOMER_CREATED",
    entityType: "CUSTOMER",
    entityId: created.id,
    ipAddress: getRequestIp(request),
    metadata: { navn: created.navn, status: created.status }
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
