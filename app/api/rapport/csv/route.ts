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

export async function GET(request: Request) {
  const { session, response } = await requireAuthApi();
  if (response) return response;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const periodStart = url.searchParams.get("periodStart");
  const period = get14DayPeriodFromInput(periodStart);

  const [periodTimeSums, periodBillableTimeSums, periodFinanceSums] = await Promise.all([
    db.timeEntry.groupBy({
      by: ["projectId"],
      where: {
        dato: {
          gte: period.start,
          lt: period.endExclusive
        }
      },
      _sum: {
        timer: true,
        belopEksMva: true
      },
      _count: {
        _all: true
      }
    }),
    db.timeEntry.groupBy({
      by: ["projectId"],
      where: {
        dato: {
          gte: period.start,
          lt: period.endExclusive
        },
        fakturerbar: true
      },
      _sum: {
        belopEksMva: true
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
  for (const sum of periodTimeSums) {
    projectIdSet.add(sum.projectId);
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
  const periodTimeByProject = new Map(periodTimeSums.map((sum) => [sum.projectId, sum]));
  const periodBillableByProject = new Map(periodBillableTimeSums.map((sum) => [sum.projectId, sum._sum.belopEksMva ?? 0]));
  const periodFinanceByProject = getFinanceTotalsByProject(periodFinanceSums as FinanceGroupByRow[]);

  const dataRows = projectIds
    .map((projectId) => {
      const project = projectById.get(projectId);
      if (!project) {
        return null;
      }

      const periodTime = periodTimeByProject.get(projectId);
      const periodFinance = periodFinanceByProject.get(projectId) ?? { expenses: 0, surcharges: 0, entryCount: 0 };
      const periodAmount = periodTime?._sum.belopEksMva ?? 0;
      const periodHours = periodTime?._sum.timer ?? 0;
      const periodBillableTime = periodBillableByProject.get(projectId) ?? 0;
      const invoiceNow = periodBillableTime + periodFinance.surcharges;
      const periodResult = invoiceNow - (periodAmount + periodFinance.expenses);

      return {
        project,
        timeEntryCount: periodTime?._count._all ?? 0,
        financeEntryCount: periodFinance.entryCount,
        periodHours,
        periodAmount,
        periodBillableTime,
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
    "Fakturerbar tid",
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
    row.periodBillableTime,
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
