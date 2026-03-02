import { NextResponse } from "next/server";
import { TimeEntryApprovalStatus } from "@prisma/client";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  projectId: z.string().cuid()
});

const createTimeEntrySchema = z.object({
  dato: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  timer: z.number().gt(0).max(24),
  beskrivelse: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  belopEksMva: z.number().min(0).nullable().optional().default(null),
  fakturerbar: z.boolean().default(true)
});

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

function parseDateInput(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig prosjekt-id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const fromDate = parseDateInput(url.searchParams.get("from"));
  const toDate = parseDateInput(url.searchParams.get("to"));

  const where: {
    projectId: string;
    dato?: {
      gte?: Date;
      lt?: Date;
    };
  } = {
    projectId: parsedParams.data.projectId
  };

  if (fromDate || toDate) {
    where.dato = {};
    if (fromDate) {
      where.dato.gte = fromDate;
    }
    if (toDate) {
      where.dato.lt = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  const entries = await db.timeEntry.findMany({
    where,
    orderBy: [{ dato: "desc" }, { createdAt: "desc" }],
    include: {
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

  return NextResponse.json({ data: entries });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig prosjekt-id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = createTimeEntrySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  const project = await db.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { id: true, timeprisEksMva: true }
  });
  if (!project) {
    return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
  }

  const employeeProfile = await db.employeeProfile.findUnique({
    where: { userId: session.user.id },
    select: { internKostPerTime: true }
  });

  const belopEksMva =
    parsedBody.data.belopEksMva === null
      ? Number(((project.timeprisEksMva ?? 0) * parsedBody.data.timer).toFixed(2))
      : parsedBody.data.belopEksMva;

  const created = await db.timeEntry.create({
    data: {
      projectId: project.id,
      userId: session.user.id,
      dato: new Date(`${parsedBody.data.dato}T00:00:00`),
      timer: parsedBody.data.timer,
      beskrivelse: parsedBody.data.beskrivelse,
      belopEksMva,
      fakturerbar: parsedBody.data.fakturerbar,
      internKostPerTime: employeeProfile?.internKostPerTime ?? null,
      approvalStatus: TimeEntryApprovalStatus.PENDING,
      approvedById: null,
      approvedAt: null,
      approvalComment: null
    }
  });

  await logAudit({
    actorId: session.user.id,
    action: "TIME_ENTRY_CREATED",
    entityType: "TIME_ENTRY",
    entityId: created.id,
    ipAddress: getRequestIp(request),
    metadata: {
      projectId: created.projectId,
      timer: created.timer,
      belopEksMva: created.belopEksMva,
      fakturerbar: created.fakturerbar,
      internKostPerTime: created.internKostPerTime,
      approvalStatus: created.approvalStatus
    }
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
