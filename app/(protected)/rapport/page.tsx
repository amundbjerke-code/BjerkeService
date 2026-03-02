import Link from "next/link";
import { TimeEntryApprovalStatus } from "@prisma/client";

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

type TimeTotals = {
  hours: number;
  amount: number;
  cost: number;
  approvedBillableAmount: number;
  entryCount: number;
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

function getTimeCost(timer: number, belopEksMva: number, internKostPerTime: number | null): number {
  if (typeof internKostPerTime === "number") {
    return Number((timer * internKostPerTime).toFixed(2));
  }
  return belopEksMva;
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

function getTimeTotalsByProject(
  entries: Array<{
    projectId: string;
    timer: number;
    belopEksMva: number;
    fakturerbar: boolean;
    approvalStatus: TimeEntryApprovalStatus;
    internKostPerTime: number | null;
  }>
): Map<string, TimeTotals> {
  const totals = new Map<string, TimeTotals>();

  for (const entry of entries) {
    const current = totals.get(entry.projectId) ?? {
      hours: 0,
      amount: 0,
      cost: 0,
      approvedBillableAmount: 0,
      entryCount: 0
    };
    current.hours += entry.timer;
    current.amount += entry.belopEksMva;
    current.cost += getTimeCost(entry.timer, entry.belopEksMva, entry.internKostPerTime);
    current.entryCount += 1;
    if (entry.fakturerbar && entry.approvalStatus === TimeEntryApprovalStatus.APPROVED) {
      current.approvedBillableAmount += entry.belopEksMva;
    }
    totals.set(entry.projectId, current);
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

  const [projects, totalTimeEntries, totalFinanceSums] = projectIds.length
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
        db.timeEntry.findMany({
          where: { projectId: { in: projectIds } },
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
  const periodTimeByProject = getTimeTotalsByProject(periodTimeEntries);
  const periodFinanceByProject = getFinanceTotalsByProject(periodFinanceSums as FinanceGroupByRow[]);
  const totalTimeByProject = getTimeTotalsByProject(totalTimeEntries);
  const totalFinanceByProject = getFinanceTotalsByProject(totalFinanceSums as FinanceGroupByRow[]);

  const rows = projectIds
    .map((projectId) => {
      const project = projectById.get(projectId);
      if (!project) {
        return null;
      }

      const periodTime = periodTimeByProject.get(projectId) ?? { hours: 0, amount: 0, cost: 0, approvedBillableAmount: 0, entryCount: 0 };
      const periodFinance = periodFinanceByProject.get(projectId) ?? { expenses: 0, surcharges: 0, entryCount: 0 };
      const totalTime = totalTimeByProject.get(projectId) ?? { hours: 0, amount: 0, cost: 0, approvedBillableAmount: 0, entryCount: 0 };
      const totalFinance = totalFinanceByProject.get(projectId) ?? { expenses: 0, surcharges: 0, entryCount: 0 };
      const invoiceNow = periodTime.approvedBillableAmount + periodFinance.surcharges;
      const periodCost = periodTime.cost + periodFinance.expenses;
      const periodResult = invoiceNow - periodCost;
      const totalCost = totalTime.cost + totalFinance.expenses;
      const totalFastprisBase = (project.fastprisBelopEksMva ?? 0) + totalFinance.surcharges;

      return {
        project,
        periodHours: periodTime.hours,
        periodAmount: periodTime.amount,
        periodCost,
        periodApprovedBillable: periodTime.approvedBillableAmount,
        periodSurcharges: periodFinance.surcharges,
        periodExpenses: periodFinance.expenses,
        timeEntryCount: periodTime.entryCount,
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
  const totalPeriodCost = rows.reduce((sum, row) => sum + row.periodCost, 0);
  const totalApprovedBillable = rows.reduce((sum, row) => sum + row.periodApprovedBillable, 0);
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
              Summer per prosjekt for valgt 14-dagersperiode. Fakturer naa = godkjente fakturerbare timer + tillegg.
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

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Timer</p>
            <p className="mt-1 font-semibold">{formatHours(totalHours)} t</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Belop tid (alle)</p>
            <p className="mt-1 font-semibold">{formatMoney(totalAmount)}</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Kost tid (intern)</p>
            <p className="mt-1 font-semibold">{formatMoney(totalPeriodCost - totalExpenses)}</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Godkjent fakturerbar tid</p>
            <p className="mt-1 font-semibold">{formatMoney(totalApprovedBillable)}</p>
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
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="bg-brand-canvas text-xs uppercase tracking-wider text-brand-ink/70">
                <tr>
                  <th className="px-3 py-2">Prosjekt</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Tidsposter</th>
                  <th className="px-3 py-2">Okonomiposter</th>
                  <th className="px-3 py-2">Timer</th>
                  <th className="px-3 py-2">Belop tid (alle)</th>
                  <th className="px-3 py-2">Godkjent fakturerbar tid</th>
                  <th className="px-3 py-2">Kost (intern + utgifter)</th>
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
                      <td className="px-3 py-2">{formatMoney(row.periodApprovedBillable)}</td>
                      <td className="px-3 py-2 text-red-700">{formatMoney(row.periodCost)}</td>
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
