import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseDateInputToUtc } from "@/lib/planning";
import { requireRoleApi } from "@/lib/rbac";

const createAssignmentSchema = z.object({
  projectId: z.string().cuid(),
  userId: z.string().cuid(),
  dato: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  timer: z.number().gt(0).max(24)
});

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
  const { session, response } = await requireRoleApi(Role.ADMIN);
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = createAssignmentSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  const date = parseDateInputToUtc(parsedBody.data.dato);
  if (!date) {
    return NextResponse.json({ error: "Ugyldig dato" }, { status: 400 });
  }

  const [project, user] = await Promise.all([
    db.project.findUnique({
      where: { id: parsedBody.data.projectId },
      select: { id: true, navn: true }
    }),
    db.user.findUnique({
      where: { id: parsedBody.data.userId },
      select: { id: true, name: true }
    })
  ]);

  if (!project) {
    return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
  }
  if (!user) {
    return NextResponse.json({ error: "Ansatt ikke funnet" }, { status: 404 });
  }

  const existing = await db.projectStaffingAssignment.findFirst({
    where: {
      projectId: parsedBody.data.projectId,
      userId: parsedBody.data.userId,
      dato: date
    },
    select: {
      id: true,
      timer: true
    }
  });

  const saved = existing
    ? await db.projectStaffingAssignment.update({
        where: { id: existing.id },
        data: {
          timer: Number((existing.timer + parsedBody.data.timer).toFixed(2))
        },
        include: {
          project: { select: { id: true, navn: true } },
          user: { select: { id: true, name: true } }
        }
      })
    : await db.projectStaffingAssignment.create({
        data: {
          projectId: parsedBody.data.projectId,
          userId: parsedBody.data.userId,
          dato: date,
          timer: parsedBody.data.timer,
          createdById: session.user.id
        },
        include: {
          project: { select: { id: true, navn: true } },
          user: { select: { id: true, name: true } }
        }
      });

  await logAudit({
    actorId: session.user.id,
    action: existing ? "STAFFING_ASSIGNMENT_HOURS_ADDED" : "STAFFING_ASSIGNMENT_CREATED",
    entityType: "PROJECT_STAFFING_ASSIGNMENT",
    entityId: saved.id,
    ipAddress: getRequestIp(request),
    metadata: {
      projectId: saved.projectId,
      userId: saved.userId,
      dato: saved.dato,
      timer: saved.timer
    }
  });

  return NextResponse.json({ data: saved }, { status: existing ? 200 : 201 });
}
