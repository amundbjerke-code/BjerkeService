import Link from "next/link";
import { ProjectBillingType, TimeEntryApprovalStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { getProjectBillingTypeLabel } from "@/lib/project-meta";
import { requireAuthPage } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type FinanceSumByTypeRow = {
  type: string;
  _sum: {
    belopEksMva: number | null;
  };
};

type FinanceSumByProjectRow = {
  projectId: string;
  type: string;
  _sum: {
    belopEksMva: number | null;
  };
};

type ProjectSummary = {
  projectId: string;
  projectName: string;
  billingType: ProjectBillingType;
  hours: number;
  billableHours: number;
  amount: number;
  billableAmount: number;
  approvedBillableAmount: number;
  timeCost: number;
  surcharges: number;
  expenses: number;
  revenue: number;
  cost: number;
  result: number;
  coveragePercent: number | null;
};

type EmployeeSummary = {
  userId: string;
  name: string;
  hours: number;
  billableHours: number;
  amount: number;
  billableAmount: number;
  entryCount: number;
  billablePercent: number;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getPeriodDays(value: string): 30 | 90 {
  return value === "90" ? 90 : 30;
}

function getStartOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getPeriodStart(days: number, anchor: Date): Date {
  const start = getStartOfDay(anchor);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function getNextDay(date: Date): Date {
  const next = getStartOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function formatMoney(value: number): string {
  return `${value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function formatHours(value: number): string {
  return value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function getFinanceTotals(rows: FinanceSumByTypeRow[]): { expenses: number; surcharges: number } {
  return rows.reduce(
    (accumulator, row) => {
      const amount = row._sum.belopEksMva ?? 0;
      if (row.type === "UTGIFT") {
        accumulator.expenses += amount;
      } else {
        accumulator.surcharges += amount;
      }
      return accumulator;
    },
    { expenses: 0, surcharges: 0 }
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("nb-NO");
}

function getTimeCost(timer: number, belopEksMva: number, internKostPerTime: number | null): number {
  if (typeof internKostPerTime === "number") {
    return Number((timer * internKostPerTime).toFixed(2));
  }
  return belopEksMva;
}

export default async function DashboardPage({ searchParams }: Props) {
  await requireAuthPage();
  const params = (await searchParams) ?? {};
  const periodDays = getPeriodDays(toSingleValue(params.window));

  const now = new Date();
  const endExclusive = getNextDay(now);
  const periodStart30 = getPeriodStart(30, now);
  const periodStart90 = getPeriodStart(90, now);
  const activePeriodStart = periodDays === 90 ? periodStart90 : periodStart30;

  const [timeEntriesLast90Days, finance30, finance90, activeFinanceSums] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        dato: { gte: periodStart90, lt: endExclusive }
      },
      select: {
        dato: true,
        projectId: true,
        userId: true,
        timer: true,
        belopEksMva: true,
        fakturerbar: true,
        approvalStatus: true,
        internKostPerTime: true,
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    }),
    db.projectFinanceEntry.groupBy({
      by: ["type"],
      where: {
        dato: { gte: periodStart30, lt: endExclusive }
      },
      _sum: {
        belopEksMva: true
      }
    }),
    db.projectFinanceEntry.groupBy({
      by: ["type"],
      where: {
        dato: { gte: periodStart90, lt: endExclusive }
      },
      _sum: {
        belopEksMva: true
      }
    }),
    db.projectFinanceEntry.groupBy({
      by: ["projectId", "type"],
      where: {
        dato: { gte: activePeriodStart, lt: endExclusive }
      },
      _sum: {
        belopEksMva: true
      }
    })
  ]);

  const timeEntriesLast30Days = timeEntriesLast90Days.filter((entry) => entry.dato >= periodStart30);
  const activeTimeEntries = timeEntriesLast90Days.filter((entry) => entry.dato >= activePeriodStart);

  function summarizeTimeEntries(
    entries: typeof activeTimeEntries
  ): {
    hours: number;
    billableHours: number;
    amount: number;
    billableAmount: number;
    approvedBillableAmount: number;
    pendingBillableHours: number;
    pendingBillableAmount: number;
    cost: number;
  } {
    return entries.reduce(
      (accumulator, entry) => {
        accumulator.hours += entry.timer;
        accumulator.amount += entry.belopEksMva;
        accumulator.cost += getTimeCost(entry.timer, entry.belopEksMva, entry.internKostPerTime);
        if (entry.fakturerbar) {
          accumulator.billableHours += entry.timer;
          accumulator.billableAmount += entry.belopEksMva;
          if (entry.approvalStatus === TimeEntryApprovalStatus.APPROVED) {
            accumulator.approvedBillableAmount += entry.belopEksMva;
          } else if (entry.approvalStatus === TimeEntryApprovalStatus.PENDING) {
            accumulator.pendingBillableHours += entry.timer;
            accumulator.pendingBillableAmount += entry.belopEksMva;
          }
        }
        return accumulator;
      },
      {
        hours: 0,
        billableHours: 0,
        amount: 0,
        billableAmount: 0,
        approvedBillableAmount: 0,
        pendingBillableHours: 0,
        pendingBillableAmount: 0,
        cost: 0
      }
    );
  }

  const summary30 = summarizeTimeEntries(timeEntriesLast30Days);
  const summary90 = summarizeTimeEntries(timeEntriesLast90Days);
  const activeSummary = summarizeTimeEntries(activeTimeEntries);

  const finance30Totals = getFinanceTotals(finance30 as FinanceSumByTypeRow[]);
  const finance90Totals = getFinanceTotals(finance90 as FinanceSumByTypeRow[]);

  const omsetning30 = summary30.approvedBillableAmount + finance30Totals.surcharges;
  const omsetning90 = summary90.approvedBillableAmount + finance90Totals.surcharges;

  const activeHours = activeSummary.hours;
  const activeBillableHours = activeSummary.billableHours;
  const activeBillableAmount = activeSummary.billableAmount;
  const activeApprovedBillableAmount = activeSummary.approvedBillableAmount;
  const activePendingBillableHours = activeSummary.pendingBillableHours;
  const activePendingBillableAmount = activeSummary.pendingBillableAmount;
  const pendingBillableSharePercent = activeBillableAmount > 0 ? (activePendingBillableAmount / activeBillableAmount) * 100 : 0;
  const activeTimeCost = activeSummary.cost;
  const activeFinanceTotals = getFinanceTotals((activeFinanceSums as FinanceSumByProjectRow[]).map((row) => ({ type: row.type, _sum: row._sum })));
  const activeRevenue = activeApprovedBillableAmount + activeFinanceTotals.surcharges;
  const activeCost = activeTimeCost + activeFinanceTotals.expenses;
  const activeResult = activeRevenue - activeCost;
  const activeBillablePercent = activeHours > 0 ? (activeBillableHours / activeHours) * 100 : 0;

  const projectBase = new Map<string, Omit<ProjectSummary, "projectName" | "billingType" | "revenue" | "cost" | "result" | "coveragePercent">>();
  for (const entry of activeTimeEntries) {
    const current = projectBase.get(entry.projectId) ?? {
      projectId: entry.projectId,
      hours: 0,
      billableHours: 0,
      amount: 0,
      billableAmount: 0,
      approvedBillableAmount: 0,
      timeCost: 0,
      surcharges: 0,
      expenses: 0
    };
    current.hours += entry.timer;
    current.amount += entry.belopEksMva;
    current.timeCost += getTimeCost(entry.timer, entry.belopEksMva, entry.internKostPerTime);
    if (entry.fakturerbar) {
      current.billableHours += entry.timer;
      current.billableAmount += entry.belopEksMva;
      if (entry.approvalStatus === TimeEntryApprovalStatus.APPROVED) {
        current.approvedBillableAmount += entry.belopEksMva;
      }
    }
    projectBase.set(entry.projectId, current);
  }

  for (const financeRow of activeFinanceSums as FinanceSumByProjectRow[]) {
    const current = projectBase.get(financeRow.projectId) ?? {
      projectId: financeRow.projectId,
      hours: 0,
      billableHours: 0,
      amount: 0,
      billableAmount: 0,
      approvedBillableAmount: 0,
      timeCost: 0,
      surcharges: 0,
      expenses: 0
    };
    const amount = financeRow._sum.belopEksMva ?? 0;
    if (financeRow.type === "UTGIFT") {
      current.expenses += amount;
    } else {
      current.surcharges += amount;
    }
    projectBase.set(financeRow.projectId, current);
  }

  const projectIds = [...projectBase.keys()];
  const projects =
    projectIds.length > 0
      ? await db.project.findMany({
          where: { id: { in: projectIds } },
          select: {
            id: true,
            navn: true,
            billingType: true
          }
        })
      : [];
  const projectMeta = new Map(projects.map((project) => [project.id, project]));

  const projectRows: ProjectSummary[] = projectIds
    .map((projectId) => {
      const base = projectBase.get(projectId);
      const meta = projectMeta.get(projectId);
      if (!base || !meta) {
        return null;
      }
      const revenue = base.approvedBillableAmount + base.surcharges;
      const cost = base.timeCost + base.expenses;
      const result = revenue - cost;
      return {
        projectId,
        projectName: meta.navn,
        billingType: meta.billingType,
        hours: base.hours,
        billableHours: base.billableHours,
        amount: base.amount,
        billableAmount: base.billableAmount,
        approvedBillableAmount: base.approvedBillableAmount,
        timeCost: base.timeCost,
        surcharges: base.surcharges,
        expenses: base.expenses,
        revenue,
        cost,
        result,
        coveragePercent: revenue > 0 ? (result / revenue) * 100 : null
      };
    })
    .filter((row): row is ProjectSummary => row !== null)
    .sort((a, b) => b.result - a.result);

  const topCoverageProjects = projectRows
    .filter((row) => row.coveragePercent !== null)
    .sort((a, b) => (b.coveragePercent ?? -Infinity) - (a.coveragePercent ?? -Infinity))
    .slice(0, 6);

  const typeMap = new Map<ProjectBillingType, { billingType: ProjectBillingType; revenue: number; cost: number; projects: number }>();
  for (const row of projectRows) {
    const current = typeMap.get(row.billingType) ?? { billingType: row.billingType, revenue: 0, cost: 0, projects: 0 };
    current.revenue += row.revenue;
    current.cost += row.cost;
    current.projects += 1;
    typeMap.set(row.billingType, current);
  }
  const typeRows = [...typeMap.values()]
    .map((row) => {
      const result = row.revenue - row.cost;
      const marginPercent = row.revenue > 0 ? (result / row.revenue) * 100 : null;
      return {
        ...row,
        result,
        marginPercent
      };
    })
    .sort((a, b) => b.result - a.result);
  const mostProfitableType = typeRows[0] ?? null;

  const employeeMap = new Map<string, Omit<EmployeeSummary, "billablePercent">>();
  for (const entry of activeTimeEntries) {
    const current = employeeMap.get(entry.userId) ?? {
      userId: entry.userId,
      name: entry.user.name ?? entry.user.email,
      hours: 0,
      billableHours: 0,
      amount: 0,
      billableAmount: 0,
      entryCount: 0
    };
    current.hours += entry.timer;
    current.amount += entry.belopEksMva;
    current.entryCount += 1;
    if (entry.fakturerbar) {
      current.billableHours += entry.timer;
      current.billableAmount += entry.belopEksMva;
    }
    employeeMap.set(entry.userId, current);
  }
  const employeeRows: EmployeeSummary[] = [...employeeMap.values()]
    .map((row) => ({
      ...row,
      billablePercent: row.hours > 0 ? (row.billableHours / row.hours) * 100 : 0
    }))
    .sort((a, b) => b.billablePercent - a.billablePercent || b.hours - a.hours);

  const cost90 = summary90.cost + finance90Totals.expenses;
  const dailyInflow = omsetning90 / 90;
  const dailyOutflow = cost90 / 90;
  const dailyNet = dailyInflow - dailyOutflow;
  const forecastRows = [30, 60, 90].map((days) => {
    const inflow = dailyInflow * days;
    const outflow = dailyOutflow * days;
    const net = inflow - outflow;
    return { days, inflow, outflow, net };
  });

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">Avansert okonomi-dashboard</h1>
            <p className="mt-2 text-sm text-brand-ink/80">
              Sanntidsoversikt for daglig leder. Omsetning = godkjente fakturerbare timer + tillegg. Kost = internkost tid + utgifter.
            </p>
            <p className="mt-1 text-xs text-brand-ink/60">Sist oppdatert: {now.toLocaleString("nb-NO")}</p>
          </div>
          <div className="inline-flex rounded-xl border border-black/10 bg-brand-canvas p-1 text-sm">
            <Link
              href="/dashboard?window=30"
              className={`rounded-lg px-3 py-1.5 font-medium ${periodDays === 30 ? "bg-white shadow-sm" : "text-brand-ink/75 hover:text-brand-ink"}`}
            >
              30 dager
            </Link>
            <Link
              href="/dashboard?window=90"
              className={`rounded-lg px-3 py-1.5 font-medium ${periodDays === 90 ? "bg-white shadow-sm" : "text-brand-ink/75 hover:text-brand-ink"}`}
            >
              90 dager
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="brand-card p-4">
          <p className="text-xs uppercase text-brand-ink/70">Omsetning 30d</p>
          <p className="mt-1 text-lg font-semibold">{formatMoney(omsetning30)}</p>
        </div>
        <div className="brand-card p-4">
          <p className="text-xs uppercase text-brand-ink/70">Omsetning 90d</p>
          <p className="mt-1 text-lg font-semibold">{formatMoney(omsetning90)}</p>
        </div>
        <div className="brand-card p-4">
          <p className="text-xs uppercase text-brand-ink/70">Fakturerbar tid ({periodDays}d)</p>
          <p className="mt-1 text-lg font-semibold">{formatPercent(activeBillablePercent)}</p>
          <p className="text-xs text-brand-ink/70">
            {formatHours(activeBillableHours)} t av {formatHours(activeHours)} t
          </p>
        </div>
        <div className="brand-card p-4">
          <p className="text-xs uppercase text-brand-ink/70">Resultat ({periodDays}d)</p>
          <p className={`mt-1 text-lg font-semibold ${activeResult >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatMoney(activeResult)}</p>
          <p className="text-xs text-brand-ink/70">Periode {formatDate(activePeriodStart)} - {formatDate(now)}</p>
        </div>
      </div>

      <div
        className={`rounded-xl border p-4 ${
          activePendingBillableAmount > 0 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"
        }`}
      >
        {activePendingBillableAmount > 0 ? (
          <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
            <div>
              <p className="font-semibold">Varsel: ventende fakturagrunnlag</p>
              <p className="mt-1">
                {formatPercent(pendingBillableSharePercent)} av fakturerbart belop i perioden er fortsatt ventende godkjenning.
              </p>
              <p className="text-xs">
                Ventende: {formatMoney(activePendingBillableAmount)} ({formatHours(activePendingBillableHours)} t)
              </p>
            </div>
            <Link href="/admin/users" className="rounded-lg border border-amber-400/60 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100">
              Gaa til timegodkjenning
            </Link>
          </div>
        ) : (
          <p className="text-sm font-semibold">Ingen ventende fakturerbare timer i valgt periode.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Fakturerbart vs ikke fakturerbart ({periodDays}d)</h2>
          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span>Timer fakturerbar</span>
                <span className="font-medium">{formatPercent(activeBillablePercent)}</span>
              </div>
              <div className="h-2 rounded-full bg-brand-canvas">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(Math.max(activeBillablePercent, 0), 100)}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-brand-canvas p-3">
                <p className="text-xs uppercase text-brand-ink/70">Fakturerbart belop (alle)</p>
                <p className="mt-1 font-semibold">{formatMoney(activeBillableAmount)}</p>
              </div>
              <div className="rounded-lg bg-brand-canvas p-3">
                <p className="text-xs uppercase text-brand-ink/70">Godkjent for fakturering</p>
                <p className="mt-1 font-semibold">{formatMoney(activeApprovedBillableAmount)}</p>
              </div>
              <div className="rounded-lg bg-brand-canvas p-3">
                <p className="text-xs uppercase text-brand-ink/70">Fakturerbare timer</p>
                <p className="mt-1 font-semibold">{formatHours(activeBillableHours)} t</p>
              </div>
              <div className="rounded-lg bg-brand-canvas p-3">
                <p className="text-xs uppercase text-brand-ink/70">Ikke fakturerbare timer</p>
                <p className="mt-1 font-semibold">{formatHours(Math.max(activeHours - activeBillableHours, 0))} t</p>
              </div>
            </div>
          </div>
        </div>

        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Likviditetsprognose (indikativ)</h2>
          <p className="mt-1 text-xs text-brand-ink/70">Basert pa gjennomsnittlig daglig inn/ut siste 90 dager.</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-brand-canvas p-3">
              <p className="text-xs uppercase text-brand-ink/70">Daglig inn</p>
              <p className="mt-1 font-semibold">{formatMoney(dailyInflow)}</p>
            </div>
            <div className="rounded-lg bg-brand-canvas p-3">
              <p className="text-xs uppercase text-brand-ink/70">Daglig ut</p>
              <p className="mt-1 font-semibold">{formatMoney(dailyOutflow)}</p>
            </div>
            <div className="rounded-lg bg-brand-canvas p-3">
              <p className="text-xs uppercase text-brand-ink/70">Daglig netto</p>
              <p className={`mt-1 font-semibold ${dailyNet >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatMoney(dailyNet)}</p>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-brand-canvas text-xs uppercase tracking-wider text-brand-ink/70">
                <tr>
                  <th className="px-2 py-2">Horisont</th>
                  <th className="px-2 py-2">Forventet inn</th>
                  <th className="px-2 py-2">Forventet ut</th>
                  <th className="px-2 py-2">Netto</th>
                </tr>
              </thead>
              <tbody>
                {forecastRows.map((row) => (
                  <tr key={row.days} className="border-t border-black/10">
                    <td className="px-2 py-2">{row.days} dager</td>
                    <td className="px-2 py-2">{formatMoney(row.inflow)}</td>
                    <td className="px-2 py-2">{formatMoney(row.outflow)}</td>
                    <td className={`px-2 py-2 font-semibold ${row.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatMoney(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="brand-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Dekningsgrad per prosjekt ({periodDays}d)</h2>
          {mostProfitableType ? (
            <p className="text-sm text-brand-ink/75">
              Mest lonnsomme prosjekt-type:{" "}
              <span className="font-semibold">{getProjectBillingTypeLabel(mostProfitableType.billingType)}</span>
              {" "}({formatMoney(mostProfitableType.result)}
              {mostProfitableType.marginPercent !== null ? `, ${formatPercent(mostProfitableType.marginPercent)} dekningsgrad` : ""})
            </p>
          ) : null}
        </div>

        {projectRows.length === 0 ? (
          <p className="mt-2 text-sm text-brand-ink/75">Ingen tids- eller okonomiposter i valgt periode.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-brand-canvas text-xs uppercase tracking-wider text-brand-ink/70">
                <tr>
                  <th className="px-2 py-2">Prosjekt</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Omsetning</th>
                  <th className="px-2 py-2">Kost</th>
                  <th className="px-2 py-2">Resultat</th>
                  <th className="px-2 py-2">Dekningsgrad</th>
                </tr>
              </thead>
              <tbody>
                {topCoverageProjects.map((row) => (
                  <tr key={row.projectId} className="border-t border-black/10">
                    <td className="px-2 py-2">
                      <Link href={`/prosjekter/${row.projectId}#okonomi`} className="font-medium hover:underline">
                        {row.projectName}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{getProjectBillingTypeLabel(row.billingType)}</td>
                    <td className="px-2 py-2">{formatMoney(row.revenue)}</td>
                    <td className="px-2 py-2">{formatMoney(row.cost)}</td>
                    <td className={`px-2 py-2 font-semibold ${row.result >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatMoney(row.result)}</td>
                    <td className="px-2 py-2">{row.coveragePercent === null ? "-" : formatPercent(row.coveragePercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="brand-card p-4">
        <h2 className="text-lg font-semibold">Ansatt-produktivitet ({periodDays}d)</h2>
        {employeeRows.length === 0 ? (
          <p className="mt-2 text-sm text-brand-ink/75">Ingen timer registrert i valgt periode.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="bg-brand-canvas text-xs uppercase tracking-wider text-brand-ink/70">
                <tr>
                  <th className="px-2 py-2">Ansatt</th>
                  <th className="px-2 py-2">Timer</th>
                  <th className="px-2 py-2">Fakturerbare timer</th>
                  <th className="px-2 py-2">Fakturerbar %</th>
                  <th className="px-2 py-2">Fakturerbart belop</th>
                  <th className="px-2 py-2">Registreringer</th>
                </tr>
              </thead>
              <tbody>
                {employeeRows.map((row) => (
                  <tr key={row.userId} className="border-t border-black/10">
                    <td className="px-2 py-2 font-medium">{row.name}</td>
                    <td className="px-2 py-2">{formatHours(row.hours)} t</td>
                    <td className="px-2 py-2">{formatHours(row.billableHours)} t</td>
                    <td className="px-2 py-2">{formatPercent(row.billablePercent)}</td>
                    <td className="px-2 py-2">{formatMoney(row.billableAmount)}</td>
                    <td className="px-2 py-2">{row.entryCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
