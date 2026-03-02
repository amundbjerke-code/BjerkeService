import Link from "next/link";
import { ProjectStatus, Role } from "@prisma/client";

import { PlanningBoard, type PlanningBoardProps } from "@/components/planning-board";
import { db } from "@/lib/db";
import { addDaysUtc, clamp, getDateKeysInRange, getProjectSizing, parseDateInputToUtc } from "@/lib/planning";
import { requireRolePage } from "@/lib/rbac";
import { formatDateInput } from "@/lib/time-period";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getDefaultStartDate(): Date {
  return parseDateInputToUtc(formatDateInput(new Date())) ?? new Date();
}

function toInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function PlanleggingPage({ searchParams }: Props) {
  await requireRolePage(Role.ADMIN);
  const params = (await searchParams) ?? {};
  const startDate = parseDateInputToUtc(toSingleValue(params.start)) ?? getDefaultStartDate();
  const days = clamp(toInt(toSingleValue(params.days), 21), 7, 42);
  const dateKeys = getDateKeysInRange(startDate, days);
  const endExclusive = addDaysUtc(startDate, days);
  const endInclusive = addDaysUtc(endExclusive, -1);

  const [projects, users, absences, assignments] = await Promise.all([
    db.project.findMany({
      where: {
        status: {
          in: [ProjectStatus.PLANLAGT, ProjectStatus.PAGAR]
        }
      },
      orderBy: [{ status: "asc" }, { startDato: "asc" }],
      include: {
        offer: {
          select: {
            timeEstimateHours: true
          }
        }
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
        startDato: {
          lte: endInclusive
        },
        sluttDato: {
          gte: startDate
        }
      },
      select: {
        id: true,
        userId: true,
        type: true,
        startDato: true,
        sluttDato: true
      }
    }),
    db.projectStaffingAssignment.findMany({
      where: {
        dato: {
          gte: startDate,
          lt: endExclusive
        }
      },
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
            name: true
          }
        }
      },
      orderBy: [{ dato: "asc" }, { createdAt: "asc" }]
    })
  ]);

  const loggedHoursByProject = projects.length
    ? await db.timeEntry.groupBy({
        by: ["projectId"],
        where: {
          projectId: {
            in: projects.map((project) => project.id)
          }
        },
        _sum: {
          timer: true
        }
      })
    : [];
  const loggedHoursMap = new Map(loggedHoursByProject.map((row) => [row.projectId, row._sum.timer ?? 0]));

  const projectCards: PlanningBoardProps["projects"] = projects.map((project) => {
    const sizing = getProjectSizing({
      billingType: project.billingType,
      fastprisBelopEksMva: project.fastprisBelopEksMva,
      timeprisEksMva: project.timeprisEksMva,
      offerEstimateHours: project.offer?.timeEstimateHours ?? null,
      loggedHours: loggedHoursMap.get(project.id) ?? 0
    });
    return {
      id: project.id,
      navn: project.navn,
      status: project.status,
      startDato: formatDateInput(project.startDato),
      sluttDato: project.sluttDato ? formatDateInput(project.sluttDato) : null,
      sizeLabel: sizing.sizeLabel,
      defaultDropHours: sizing.defaultDropHours,
      recommendedTeamSize: sizing.recommendedTeamSize,
      estimatedTotalHours: Number(sizing.estimatedTotalHours.toFixed(1)),
      remainingHours: Number(sizing.remainingHours.toFixed(1))
    };
  });

  const absenceDateSetByUser = new Map<string, Set<string>>();
  const dateKeySet = new Set(dateKeys);
  for (const absence of absences) {
    const userSet = absenceDateSetByUser.get(absence.userId) ?? new Set<string>();
    let cursor = new Date(absence.startDato);
    while (cursor.getTime() <= absence.sluttDato.getTime()) {
      const key = formatDateInput(cursor);
      if (dateKeySet.has(key)) {
        userSet.add(key);
      }
      cursor = addDaysUtc(cursor, 1);
    }
    absenceDateSetByUser.set(absence.userId, userSet);
  }

  const employees: PlanningBoardProps["employees"] = users.map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    dailyCapacityHours: 7.5,
    absenceDates: [...(absenceDateSetByUser.get(user.id) ?? new Set<string>())]
  }));

  const assignmentRows: PlanningBoardProps["assignments"] = assignments.map((assignment) => ({
    id: assignment.id,
    projectId: assignment.projectId,
    projectName: assignment.project.navn,
    userId: assignment.userId,
    userName: assignment.user.name,
    dato: formatDateInput(assignment.dato),
    timer: assignment.timer
  }));

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">Planlegging & Ressursstyring</h1>
            <p className="mt-1 text-sm text-brand-ink/80">Kalender for prosjekter og ansatte med kapasitet, overbooking-varsel og smart bemanningsforslag.</p>
          </div>
          <Link href="/prosjekter" className="rounded-lg bg-brand-canvas px-3 py-2 text-sm font-semibold hover:bg-brand-canvas/80">
            Til prosjekter
          </Link>
        </div>
      </div>

      <form className="brand-card grid grid-cols-1 gap-3 p-4 sm:grid-cols-[220px_160px_auto]">
        <label className="block text-sm font-medium">
          Startdato
          <input type="date" name="start" defaultValue={formatDateInput(startDate)} className="brand-input mt-1" />
        </label>
        <label className="block text-sm font-medium">
          Horisont (dager)
          <select name="days" defaultValue={String(days)} className="brand-input mt-1">
            <option value="7">7</option>
            <option value="14">14</option>
            <option value="21">21</option>
            <option value="28">28</option>
            <option value="42">42</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="brand-button w-full sm:w-auto">
            Oppdater visning
          </button>
        </div>
      </form>

      <PlanningBoard
        startDate={formatDateInput(startDate)}
        days={days}
        dateKeys={dateKeys}
        projects={projectCards}
        employees={employees}
        assignments={assignmentRows}
      />
    </section>
  );
}
