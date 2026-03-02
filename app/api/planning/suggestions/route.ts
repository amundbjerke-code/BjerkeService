import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  addDaysUtc,
  buildAutoSuggestions,
  clamp,
  DEFAULT_DAILY_CAPACITY_HOURS,
  getDateKeysInRange,
  getProjectSizing,
  parseDateInputToUtc
} from "@/lib/planning";
import { formatDateInput } from "@/lib/time-period";
import { requireRoleApi } from "@/lib/rbac";

const suggestionRequestSchema = z.object({
  projectId: z.string().cuid(),
  startDato: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(7).max(60).optional().default(21),
  apply: z.boolean().optional().default(false)
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
  const parsedBody = suggestionRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  const startDate = parseDateInputToUtc(parsedBody.data.startDato);
  if (!startDate) {
    return NextResponse.json({ error: "Ugyldig startdato" }, { status: 400 });
  }
  const days = clamp(parsedBody.data.days, 7, 60);
  const periodStart = startDate;
  const periodEndExclusive = addDaysUtc(periodStart, days);
  const periodEndInclusive = addDaysUtc(periodEndExclusive, -1);
  const dateKeys = getDateKeysInRange(periodStart, days);

  const [project, timeTotals, users, absences, existingAssignments] = await Promise.all([
    db.project.findUnique({
      where: { id: parsedBody.data.projectId },
      include: {
        offer: {
          select: {
            timeEstimateHours: true
          }
        }
      }
    }),
    db.timeEntry.aggregate({
      where: { projectId: parsedBody.data.projectId },
      _sum: {
        timer: true
      }
    }),
    db.user.findMany({
      where: {
        role: {
          in: [Role.ADMIN, Role.EMPLOYEE]
        }
      },
      orderBy: [{ role: "desc" }, { name: "asc" }],
      include: {
        employeeProfile: {
          select: {
            id: true
          }
        }
      }
    }),
    db.employeeAbsence.findMany({
      where: {
        startDato: { lte: periodEndInclusive },
        sluttDato: { gte: periodStart }
      },
      select: {
        userId: true,
        startDato: true,
        sluttDato: true
      }
    }),
    db.projectStaffingAssignment.findMany({
      where: {
        dato: {
          gte: periodStart,
          lt: periodEndExclusive
        }
      },
      select: {
        userId: true,
        dato: true,
        timer: true
      }
    })
  ]);

  if (!project) {
    return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
  }

  const loggedHours = timeTotals._sum.timer ?? 0;
  const sizing = getProjectSizing({
    billingType: project.billingType,
    fastprisBelopEksMva: project.fastprisBelopEksMva,
    timeprisEksMva: project.timeprisEksMva,
    offerEstimateHours: project.offer?.timeEstimateHours ?? null,
    loggedHours
  });

  const absenceByUser = new Map<string, Set<string>>();
  for (const absence of absences) {
    const current = absenceByUser.get(absence.userId) ?? new Set<string>();
    let cursor = new Date(absence.startDato);
    while (cursor.getTime() <= absence.sluttDato.getTime()) {
      const key = formatDateInput(cursor);
      if (dateKeys.includes(key)) {
        current.add(key);
      }
      cursor = addDaysUtc(cursor, 1);
    }
    absenceByUser.set(absence.userId, current);
  }

  const existingHoursByUserDate = existingAssignments.reduce((accumulator, assignment) => {
    const key = `${assignment.userId}:${formatDateInput(assignment.dato)}`;
    accumulator.set(key, Number(((accumulator.get(key) ?? 0) + assignment.timer).toFixed(2)));
    return accumulator;
  }, new Map<string, number>());

  const employees = users.map((user) => ({
    userId: user.id,
    name: user.name,
    dailyCapacityHours: DEFAULT_DAILY_CAPACITY_HOURS,
    absenceDateKeys: absenceByUser.get(user.id) ?? new Set<string>()
  }));

  const suggestionResult = buildAutoSuggestions({
    projectSizing: sizing,
    employees,
    dateKeys,
    existingHoursByUserDate
  });

  let appliedAssignments: Array<{
    id: string;
    projectId: string;
    userId: string;
    dato: Date;
    timer: number;
    project: { id: string; navn: string };
    user: { id: string; name: string };
  }> = [];

  if (parsedBody.data.apply && suggestionResult.suggestions.length > 0) {
    appliedAssignments = await db.$transaction(async (transaction) => {
      const createdOrUpdated: Array<{
        id: string;
        projectId: string;
        userId: string;
        dato: Date;
        timer: number;
        project: { id: string; navn: string };
        user: { id: string; name: string };
      }> = [];

      for (const suggestion of suggestionResult.suggestions) {
        const date = parseDateInputToUtc(suggestion.dato);
        if (!date) {
          continue;
        }
        const existing = await transaction.projectStaffingAssignment.findFirst({
          where: {
            projectId: parsedBody.data.projectId,
            userId: suggestion.userId,
            dato: date
          },
          select: {
            id: true,
            timer: true
          }
        });
        const saved = existing
          ? await transaction.projectStaffingAssignment.update({
              where: { id: existing.id },
              data: {
                timer: Number((existing.timer + suggestion.timer).toFixed(2))
              },
              include: {
                project: { select: { id: true, navn: true } },
                user: { select: { id: true, name: true } }
              }
            })
          : await transaction.projectStaffingAssignment.create({
              data: {
                projectId: parsedBody.data.projectId,
                userId: suggestion.userId,
                dato: date,
                timer: suggestion.timer,
                createdById: session.user.id
              },
              include: {
                project: { select: { id: true, navn: true } },
                user: { select: { id: true, name: true } }
              }
            });
        createdOrUpdated.push(saved);
      }
      return createdOrUpdated;
    });

    await logAudit({
      actorId: session.user.id,
      action: "STAFFING_SUGGESTION_APPLIED",
      entityType: "PROJECT",
      entityId: project.id,
      ipAddress: getRequestIp(request),
      metadata: {
        projectId: project.id,
        suggestionCount: suggestionResult.suggestions.length,
        appliedCount: appliedAssignments.length,
        periodStart: parsedBody.data.startDato,
        days
      }
    });
  }

  return NextResponse.json({
    data: {
      project: {
        id: project.id,
        navn: project.navn
      },
      sizing,
      suggestions: suggestionResult.suggestions,
      unallocatedHours: suggestionResult.unallocatedHours,
      applied: parsedBody.data.apply,
      appliedAssignments
    }
  });
}
