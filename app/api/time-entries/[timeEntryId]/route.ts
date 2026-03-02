import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  timeEntryId: z.string().cuid()
});

const patchSchema = z.object({
  dato: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  timer: z.number().gt(0).max(24).optional(),
  beskrivelse: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  belopEksMva: z.number().min(0).optional(),
  fakturerbar: z.boolean().optional()
});

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function GET(request: Request, context: { params: Promise<{ timeEntryId: string }> }) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig time-id" }, { status: 400 });
  }

  const entry = await db.timeEntry.findUnique({
    where: { id: parsedParams.data.timeEntryId },
    include: {
      project: {
        select: {
          id: true,
          navn: true
        }
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      approvedBy: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!entry) {
    return NextResponse.json({ error: "Timeregistrering ikke funnet" }, { status: 404 });
  }

  return NextResponse.json({ data: entry });
}

export async function PATCH(request: Request, context: { params: Promise<{ timeEntryId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig time-id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = patchSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  const existing = await db.timeEntry.findUnique({
    where: { id: parsedParams.data.timeEntryId },
    select: { id: true, approvalStatus: true, projectId: true }
  });
  if (!existing) {
    return NextResponse.json({ error: "Timeregistrering ikke funnet" }, { status: 404 });
  }

  const data: {
    dato?: Date;
    timer?: number;
    beskrivelse?: string | null;
    belopEksMva?: number;
    fakturerbar?: boolean;
    approvalStatus?: "PENDING";
    approvedById?: null;
    approvedAt?: null;
    approvalComment?: null;
  } = {};

  if (parsedBody.data.dato) {
    data.dato = new Date(`${parsedBody.data.dato}T00:00:00`);
  }
  if (typeof parsedBody.data.timer === "number") {
    data.timer = parsedBody.data.timer;
  }
  if (typeof parsedBody.data.beskrivelse !== "undefined") {
    data.beskrivelse = parsedBody.data.beskrivelse;
  }
  if (typeof parsedBody.data.belopEksMva === "number") {
    data.belopEksMva = parsedBody.data.belopEksMva;
  }
  if (typeof parsedBody.data.fakturerbar === "boolean") {
    data.fakturerbar = parsedBody.data.fakturerbar;
  }

  const hasMutatingChanges =
    typeof parsedBody.data.dato === "string" ||
    typeof parsedBody.data.timer === "number" ||
    typeof parsedBody.data.beskrivelse !== "undefined" ||
    typeof parsedBody.data.belopEksMva === "number" ||
    typeof parsedBody.data.fakturerbar === "boolean";

  if (hasMutatingChanges && existing.approvalStatus !== "PENDING") {
    data.approvalStatus = "PENDING";
    data.approvedById = null;
    data.approvedAt = null;
    data.approvalComment = null;
  }

  const updated = await db.timeEntry.update({
    where: { id: existing.id },
    data
  });

  await logAudit({
    actorId: session.user.id,
    action: "TIME_ENTRY_UPDATED",
    entityType: "TIME_ENTRY",
    entityId: updated.id,
    ipAddress: getRequestIp(request),
    metadata: {
      projectId: updated.projectId,
      timer: updated.timer,
      belopEksMva: updated.belopEksMva,
      fakturerbar: updated.fakturerbar,
      approvalStatus: updated.approvalStatus
    }
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: Request, context: { params: Promise<{ timeEntryId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig time-id" }, { status: 400 });
  }

  const deleted = await db.timeEntry.delete({
    where: { id: parsedParams.data.timeEntryId }
  });

  await logAudit({
    actorId: session.user.id,
    action: "TIME_ENTRY_DELETED",
    entityType: "TIME_ENTRY",
    entityId: deleted.id,
    ipAddress: getRequestIp(request),
    metadata: { projectId: deleted.projectId }
  });

  return NextResponse.json({ data: deleted });
}
