import Link from "next/link";

import { db } from "@/lib/db";
import { getProjectBillingTypeLabel } from "@/lib/project-meta";
import { requireAuthPage } from "@/lib/rbac";
import { buildPeriodOptions, formatDateInput, get14DayPeriodFromInput, shiftPeriod } from "@/lib/time-period";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatMoney(amount: number): string {
  return `${amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function formatHours(value: number): string {
  return value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

export default async function RapportPage({ searchParams }: Props) {
  await requireAuthPage();
  const params = (await searchParams) ?? {};

  const period = get14DayPeriodFromInput(toSingleValue(params.periodStart));
  const periodStartValue = formatDateInput(period.start);
  const periodOptions = buildPeriodOptions(period, 4, 4);
  const previousPeriod = shiftPeriod(period, -1);
  const nextPeriod = shiftPeriod(period, 1);

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

  const [projects, totalTimeCostSums, totalFinanceSums] = projectIds.length
    ? await Promise.all([
        db.project.findMany({
          where: { id: { in: projectIds } },
          select: {
            id: true,
            navn: true,
            status: true,
            billingType: true,
            fastprisBelopEksMva: true
          }
        }),
        db.timeEntry.groupBy({
          by: ["projectId"],
          where: { projectId: { in: projectIds } },
          _sum: {
            belopEksMva: true
          }
        }),
        db.projectFinanceEntry.groupBy({
          by: ["projectId", "type"],
          where: { projectId: { in: projectIds } },
          _sum: {
            belopEksMva: true
          },
          _count: {
            _all: true
          }
        })
      ])
    : [[], [], []];

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const periodTimeByProject = new Map(periodTimeSums.map((sum) => [sum.projectId, sum]));
  const periodBillableByProject = new Map(periodBillableTimeSums.map((sum) => [sum.projectId, sum._sum.belopEksMva ?? 0]));
  const periodFinanceByProject = getFinanceTotalsByProject(periodFinanceSums as FinanceGroupByRow[]);
  const totalTimeCostByProject = new Map(totalTimeCostSums.map((sum) => [sum.projectId, sum._sum.belopEksMva ?? 0]));
  const totalFinanceByProject = getFinanceTotalsByProject(totalFinanceSums as FinanceGroupByRow[]);

  const rows = projectIds
    .map((projectId) => {
      const project = projectById.get(projectId);
      if (!project) {
        return null;
      }

      const periodTime = periodTimeByProject.get(projectId);
      const periodFinance = periodFinanceByProject.get(projectId) ?? { expenses: 0, surcharges: 0, entryCount: 0 };
      const totalFinance = totalFinanceByProject.get(projectId) ?? { expenses: 0, surcharges: 0, entryCount: 0 };
      const periodAmount = periodTime?._sum.belopEksMva ?? 0;
      const periodHours = periodTime?._sum.timer ?? 0;
      const periodBillableTime = periodBillableByProject.get(projectId) ?? 0;
      const invoiceNow = periodBillableTime + periodFinance.surcharges;
      const periodCost = periodAmount + periodFinance.expenses;
      const periodResult = invoiceNow - periodCost;
      const totalCost = (totalTimeCostByProject.get(projectId) ?? 0) + totalFinance.expenses;
      const totalFastprisBase = (project.fastprisBelopEksMva ?? 0) + totalFinance.surcharges;

      return {
        project,
        periodAmount,
        periodHours,
        periodSurcharges: periodFinance.surcharges,
        periodExpenses: periodFinance.expenses,
        timeEntryCount: periodTime?._count._all ?? 0,
        financeEntryCount: periodFinance.entryCount,
        invoiceNow,
        periodResult,
        totalCost,
        totalFastprisBase
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.invoiceNow - a.invoiceNow);

  const totalHours = rows.reduce((sum, row) => sum + row.periodHours, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.periodAmount, 0);
  const totalSurcharges = rows.reduce((sum, row) => sum + row.periodSurcharges, 0);
  const totalExpenses = rows.reduce((sum, row) => sum + row.periodExpenses, 0);
  const totalInvoiceNow = rows.reduce((sum, row) => sum + row.invoiceNow, 0);
  const totalPeriodResult = rows.reduce((sum, row) => sum + row.periodResult, 0);
  const isPositiveTotalResult = totalPeriodResult >= 0;

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">Fakturer naa</h1>
            <p className="mt-2 text-sm text-brand-ink/80">
              Summer per prosjekt for valgt 14-dagersperiode. Fakturer naa = fakturerbare timer + tillegg.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href={`/rapport?periodStart=${formatDateInput(previousPeriod.start)}`} className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
              Forrige
            </Link>
            <Link href={`/rapport?periodStart=${formatDateInput(nextPeriod.start)}`} className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
              Neste
            </Link>
            <a
              href={`/api/rapport/csv?periodStart=${periodStartValue}`}
              download
              className="rounded-lg bg-brand-red px-3 py-2 text-white hover:bg-brand-red/90"
            >
              Last ned CSV
            </a>
          </div>
        </div>
      </div>

      <div className="brand-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Periode</h2>
            <p className="text-sm text-brand-ink/75">
              {formatDateInput(period.start)} til {formatDateInput(period.endInclusive)}
            </p>
          </div>
          <form className="flex items-end gap-2">
            <label className="text-sm font-medium">
              Velg periode
              <select name="periodStart" defaultValue={periodStartValue} className="brand-input mt-1">
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="brand-button px-3 py-2 text-sm">
              Vis
            </button>
          </form>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Timer</p>
            <p className="mt-1 font-semibold">{formatHours(totalHours)} t</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Belop tid (alle)</p>
            <p className="mt-1 font-semibold">{formatMoney(totalAmount)}</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Tillegg</p>
            <p className="mt-1 font-semibold text-emerald-700">{formatMoney(totalSurcharges)}</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Utgifter</p>
            <p className="mt-1 font-semibold text-red-700">{formatMoney(totalExpenses)}</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Fakturer naa</p>
            <p className="mt-1 font-semibold">{formatMoney(totalInvoiceNow)}</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Resultat (periode)</p>
            <p className={`mt-1 font-semibold ${isPositiveTotalResult ? "text-emerald-700" : "text-red-700"}`}>
              {formatMoney(totalPeriodResult)}
            </p>
          </div>
        </div>
      </div>

      <div className="brand-card p-4">
        <h2 className="text-lg font-semibold">Prosjekter i perioden</h2>

        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-brand-ink/75">Ingen tids- eller okonomiposter i valgt periode.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1220px] text-left text-sm">
              <thead className="bg-brand-canvas text-xs uppercase tracking-wider text-brand-ink/70">
                <tr>
                  <th className="px-3 py-2">Prosjekt</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Tidsposter</th>
                  <th className="px-3 py-2">Okonomiposter</th>
                  <th className="px-3 py-2">Timer</th>
                  <th className="px-3 py-2">Belop tid (alle)</th>
                  <th className="px-3 py-2">Tillegg</th>
                  <th className="px-3 py-2">Utgifter</th>
                  <th className="px-3 py-2">Fakturer naa</th>
                  <th className="px-3 py-2">Resultat</th>
                  <th className="px-3 py-2">Fastpris-forbruk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const fastprisText =
                    row.project.billingType === "FASTPRIS" && row.project.fastprisBelopEksMva !== null
                      ? `${formatMoney(row.totalCost)} av ${formatMoney(row.totalFastprisBase)}`
                      : "-";

                  return (
                    <tr key={row.project.id} className="border-t border-black/10">
                      <td className="px-3 py-2">
                        <Link href={`/prosjekter/${row.project.id}#okonomi`} className="font-medium hover:underline">
                          {row.project.navn}
                        </Link>
                        <p className="text-xs text-brand-ink/70">{row.project.status}</p>
                      </td>
                      <td className="px-3 py-2">{getProjectBillingTypeLabel(row.project.billingType)}</td>
                      <td className="px-3 py-2">{row.timeEntryCount}</td>
                      <td className="px-3 py-2">{row.financeEntryCount}</td>
                      <td className="px-3 py-2">{formatHours(row.periodHours)} t</td>
                      <td className="px-3 py-2">{formatMoney(row.periodAmount)}</td>
                      <td className="px-3 py-2 text-emerald-700">{formatMoney(row.periodSurcharges)}</td>
                      <td className="px-3 py-2 text-red-700">{formatMoney(row.periodExpenses)}</td>
                      <td className="px-3 py-2 font-semibold">{formatMoney(row.invoiceNow)}</td>
                      <td className={`px-3 py-2 font-semibold ${row.periodResult >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {formatMoney(row.periodResult)}
                      </td>
                      <td className="px-3 py-2">{fastprisText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
