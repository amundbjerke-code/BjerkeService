import { CustomerStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  customerId: z.string().cuid()
});

const updateCustomerSchema = z.object({
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

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function GET(request: Request, context: { params: Promise<{ customerId: string }> }) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig kunde-id" }, { status: 400 });
  }

  const customer = await db.customer.findUnique({
    where: { id: parsedParams.data.customerId }
  });
  if (!customer) {
    return NextResponse.json({ error: "Kunde ikke funnet" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      ...customer,
      prosjekter: []
    }
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ customerId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig kunde-id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = updateCustomerSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  const updated = await db.customer.update({
    where: { id: parsedParams.data.customerId },
    data: parsedBody.data
  });

  await logAudit({
    actorId: session.user.id,
    action: "CUSTOMER_UPDATED",
    entityType: "CUSTOMER",
    entityId: updated.id,
    ipAddress: getRequestIp(request),
    metadata: { navn: updated.navn, status: updated.status }
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: Request, context: { params: Promise<{ customerId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig kunde-id" }, { status: 400 });
  }

  const updated = await db.customer.update({
    where: { id: parsedParams.data.customerId },
    data: { status: CustomerStatus.INACTIVE }
  });

  await logAudit({
    actorId: session.user.id,
    action: "CUSTOMER_DEACTIVATED",
    entityType: "CUSTOMER",
    entityId: updated.id,
    ipAddress: getRequestIp(request),
    metadata: { navn: updated.navn, status: updated.status }
  });

  return NextResponse.json({ data: updated });
}
