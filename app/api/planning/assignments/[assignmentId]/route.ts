import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseDateInputToUtc } from "@/lib/planning";
import { requireRoleApi } from "@/lib/rbac";

const paramsSchema = z.object({
  assignmentId: z.string().cuid()
});

const updateAssignmentSchema = z
  .object({
    userId: z.string().cuid().optional(),
    dato: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    timer: z.number().gt(0).max(24).optional()
  })
  .refine((value) => value.userId !== undefined || value.dato !== undefined || value.timer !== undefined, {
    message: "Minst ett felt ma oppgis"
  });

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function PATCH(request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  const { session, response } = await requireRoleApi(Role.ADMIN);
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = updateAssignmentSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  const existing = await db.projectStaffingAssignment.findUnique({
    where: { id: parsedParams.data.assignmentId },
    select: {
      id: true,
      projectId: true,
      userId: true,
      dato: true,
      timer: true
    }
  });
  if (!existing) {
    return NextResponse.json({ error: "Bemanningslinje ikke funnet" }, { status: 404 });
  }

  const nextDato = parsedBody.data.dato ? parseDateInputToUtc(parsedBody.data.dato) : existing.dato;
  if (!nextDato) {
    return NextResponse.json({ error: "Ugyldig dato" }, { status: 400 });
  }

  const nextUserId = parsedBody.data.userId ?? existing.userId;
  const nextTimer = parsedBody.data.timer ?? existing.timer;

  const duplicate = await db.projectStaffingAssignment.findFirst({
    where: {
      projectId: existing.projectId,
      userId: nextUserId,
      dato: nextDato,
      id: {
        not: existing.id
      }
    },
    select: {
      id: true,
      timer: true
    }
  });

  const updated = duplicate
    ? await db.$transaction(async (transaction) => {
        const merged = await transaction.projectStaffingAssignment.update({
          where: { id: duplicate.id },
          data: {
            timer: Number((duplicate.timer + nextTimer).toFixed(2))
          },
          include: {
            project: { select: { id: true, navn: true } },
            user: { select: { id: true, name: true } }
          }
        });
        await transaction.projectStaffingAssignment.delete({
          where: { id: existing.id }
        });
        return merged;
      })
    : await db.projectStaffingAssignment.update({
        where: { id: existing.id },
        data: {
          userId: nextUserId,
          dato: nextDato,
          timer: nextTimer
        },
        include: {
          project: { select: { id: true, navn: true } },
          user: { select: { id: true, name: true } }
        }
      });

  await logAudit({
    actorId: session.user.id,
    action: "STAFFING_ASSIGNMENT_UPDATED",
    entityType: "PROJECT_STAFFING_ASSIGNMENT",
    entityId: updated.id,
    ipAddress: getRequestIp(request),
    metadata: {
      previous: {
        userId: existing.userId,
        dato: existing.dato,
        timer: existing.timer
      },
      next: {
        userId: updated.userId,
        dato: updated.dato,
        timer: updated.timer
      }
    }
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  const { session, response } = await requireRoleApi(Role.ADMIN);
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig id" }, { status: 400 });
  }

  const existing = await db.projectStaffingAssignment.findUnique({
    where: { id: parsedParams.data.assignmentId },
    select: {
      id: true,
      projectId: true,
      userId: true,
      dato: true,
      timer: true
    }
  });
  if (!existing) {
    return NextResponse.json({ error: "Bemanningslinje ikke funnet" }, { status: 404 });
  }

  await db.projectStaffingAssignment.delete({
    where: { id: existing.id }
  });

  await logAudit({
    actorId: session.user.id,
    action: "STAFFING_ASSIGNMENT_DELETED",
    entityType: "PROJECT_STAFFING_ASSIGNMENT",
    entityId: existing.id,
    ipAddress: getRequestIp(request),
    metadata: {
      projectId: existing.projectId,
      userId: existing.userId,
      dato: existing.dato,
      timer: existing.timer
    }
  });

  return NextResponse.json({ ok: true });
}
