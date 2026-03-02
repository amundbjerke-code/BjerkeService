import { TimeEntryApprovalStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { buildCSV } from "@/lib/csv";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";
import { formatDateInput, get14DayPeriodFromInput } from "@/lib/time-period";

type FinanceGroupByRow = {
  projectId: string;
  type: string;
  _sum: {
    belopEksMva: number | null;
  };
  _count: {
    _all: number;
  };
};

function getFinanceTotalsByProject(sums: FinanceGroupByRow[]): Map<string, { expenses: number; surcharges: number; entryCount: number }> {
  const totals = new Map<string, { expenses: number; surcharges: number; entryCount: number }>();

  for (const sum of sums) {
    const current = totals.get(sum.projectId) ?? { expenses: 0, surcharges: 0, entryCount: 0 };
    const amount = sum._sum.belopEksMva ?? 0;
    current.entryCount += sum._count._all;
    if (sum.type === "UTGIFT") {
      current.expenses += amount;
    } else {
      current.surcharges += amount;
    }
    totals.set(sum.projectId, current);
  }

  return totals;
}

function getTimeCost(timer: number, belopEksMva: number, internKostPerTime: number | null): number {
  if (typeof internKostPerTime === "number") {
    return Number((timer * internKostPerTime).toFixed(2));
  }
  return belopEksMva;
}

export async function GET(request: Request) {
  const { session, response } = await requireAuthApi();
  if (response) return response;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const periodStart = url.searchParams.get("periodStart");
  const period = get14DayPeriodFromInput(periodStart);

  const [periodTimeEntries, periodFinanceSums] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        dato: {
          gte: period.start,
          lt: period.endExclusive
        }
      },
      select: {
        projectId: true,
        timer: true,
        belopEksMva: true,
        fakturerbar: true,
        approvalStatus: true,
        internKostPerTime: true
      }
    }),
    db.projectFinanceEntry.groupBy({
      by: ["projectId", "type"],
      where: {
        dato: {
          gte: period.start,
          lt: period.endExclusive
        }
      },
      _sum: {
        belopEksMva: true
      },
      _count: {
        _all: true
      }
    })
  ]);

  const projectIdSet = new Set<string>();
  for (const entry of periodTimeEntries) {
    projectIdSet.add(entry.projectId);
  }
  for (const sum of periodFinanceSums) {
    projectIdSet.add(sum.projectId);
  }
  const projectIds = [...projectIdSet];

  const projects = projectIds.length
    ? await db.project.findMany({
        where: { id: { in: projectIds } },
        select: {
          id: true,
          navn: true,
          billingType: true,
          customer: {
            select: {
              navn: true,
              orgnr: true
            }
          }
        }
      })
    : [];

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const periodFinanceByProject = getFinanceTotalsByProject(periodFinanceSums as FinanceGroupByRow[]);
  const periodTimeByProject = new Map<
    string,
    {
      hours: number;
      amount: number;
      cost: number;
      approvedBillableAmount: number;
      timeEntryCount: number;
    }
  >();

  for (const entry of periodTimeEntries) {
    const current = periodTimeByProject.get(entry.projectId) ?? {
      hours: 0,
      amount: 0,
      cost: 0,
      approvedBillableAmount: 0,
      timeEntryCount: 0
    };
    current.hours += entry.timer;
    current.amount += entry.belopEksMva;
    current.cost += getTimeCost(entry.timer, entry.belopEksMva, entry.internKostPerTime);
    current.timeEntryCount += 1;
    if (entry.fakturerbar && entry.approvalStatus === TimeEntryApprovalStatus.APPROVED) {
      current.approvedBillableAmount += entry.belopEksMva;
    }
    periodTimeByProject.set(entry.projectId, current);
  }

  const dataRows = projectIds
    .map((projectId) => {
      const project = projectById.get(projectId);
      if (!project) {
        return null;
      }

      const periodTime = periodTimeByProject.get(projectId) ?? { hours: 0, amount: 0, cost: 0, approvedBillableAmount: 0, timeEntryCount: 0 };
      const periodFinance = periodFinanceByProject.get(projectId) ?? { expenses: 0, surcharges: 0, entryCount: 0 };
      const invoiceNow = periodTime.approvedBillableAmount + periodFinance.surcharges;
      const periodResult = invoiceNow - (periodTime.cost + periodFinance.expenses);

      return {
        project,
        timeEntryCount: periodTime.timeEntryCount,
        financeEntryCount: periodFinance.entryCount,
        periodHours: periodTime.hours,
        periodAmount: periodTime.amount,
        periodCost: periodTime.cost,
        periodApprovedBillable: periodTime.approvedBillableAmount,
        periodSurcharges: periodFinance.surcharges,
        periodExpenses: periodFinance.expenses,
        invoiceNow,
        periodResult
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.invoiceNow - a.invoiceNow);

  const headers = [
    "Periode start",
    "Periode slutt",
    "Prosjekt",
    "Kunde",
    "Orgnr",
    "Billingtype",
    "Tidsposter",
    "Okonomiposter",
    "Timer",
    "Belop tid (alle)",
    "Kost tid (intern)",
    "Godkjent fakturerbar tid",
    "Tillegg",
    "Utgifter",
    "Fakturer naa",
    "Resultat (periode)"
  ];

  const rows = dataRows.map((row) => [
    formatDateInput(period.start),
    formatDateInput(period.endInclusive),
    row.project.navn,
    row.project.customer.navn,
    row.project.customer.orgnr,
    row.project.billingType,
    row.timeEntryCount,
    row.financeEntryCount,
    row.periodHours,
    row.periodAmount,
    row.periodCost,
    row.periodApprovedBillable,
    row.periodSurcharges,
    row.periodExpenses,
    row.invoiceNow,
    row.periodResult
  ]);

  const csv = buildCSV(headers, rows);
  const filename = `fakturagrunnlag_aggregert_${formatDateInput(period.start)}_${formatDateInput(period.endInclusive)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
