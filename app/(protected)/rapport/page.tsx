import Link from "next/link";

import { db } from "@/lib/db";
import { getProjectBillingTypeLabel } from "@/lib/project-meta";
import { requireAuthPage } from "@/lib/rbac";
import { buildPeriodOptions, formatDateInput, get14DayPeriodFromInput, shiftPeriod } from "@/lib/time-period";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

export default async function RapportPage({ searchParams }: Props) {
  await requireAuthPage();
  const params = (await searchParams) ?? {};

  const period = get14DayPeriodFromInput(toSingleValue(params.periodStart));
  const periodStartValue = formatDateInput(period.start);
  const periodOptions = buildPeriodOptions(period, 4, 4);
  const previousPeriod = shiftPeriod(period, -1);
  const nextPeriod = shiftPeriod(period, 1);

  const [allSums, billableSums] = await Promise.all([
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
    })
  ]);

  const projectIds = allSums.map((entry) => entry.projectId);

  const [projects, totalCostSums] = projectIds.length
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
        })
      ])
    : [[], []];

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const billableByProject = new Map(billableSums.map((sum) => [sum.projectId, sum._sum.belopEksMva ?? 0]));
  const totalCostByProject = new Map(totalCostSums.map((sum) => [sum.projectId, sum._sum.belopEksMva ?? 0]));

  const rows = allSums
    .map((sum) => {
      const project = projectById.get(sum.projectId);
      if (!project) {
        return null;
      }

      const periodAmount = sum._sum.belopEksMva ?? 0;
      const periodHours = sum._sum.timer ?? 0;
      const billableAmount = billableByProject.get(sum.projectId) ?? 0;
      const totalCost = totalCostByProject.get(sum.projectId) ?? 0;

      return {
        project,
        periodAmount,
        periodHours,
        billableAmount,
        entryCount: sum._count._all,
        totalCost
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.billableAmount - a.billableAmount);

  const totalBillable = rows.reduce((sum, row) => sum + row.billableAmount, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.periodAmount, 0);
  const totalHours = rows.reduce((sum, row) => sum + row.periodHours, 0);

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">Fakturer naa</h1>
            <p className="mt-2 text-sm text-brand-ink/80">
              Summer per prosjekt for valgt 14-dagersperiode. Fakturagrunnlag = sum fakturerbare belop eks mva.
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href={`/rapport?periodStart=${formatDateInput(previousPeriod.start)}`} className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
              Forrige
            </Link>
            <Link href={`/rapport?periodStart=${formatDateInput(nextPeriod.start)}`} className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
              Neste
            </Link>
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

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Timer</p>
            <p className="mt-1 font-semibold">{formatHours(totalHours)} t</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Belop (alle)</p>
            <p className="mt-1 font-semibold">{formatMoney(totalAmount)}</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Fakturer naa</p>
            <p className="mt-1 font-semibold">{formatMoney(totalBillable)}</p>
          </div>
        </div>
      </div>

      <div className="brand-card p-4">
        <h2 className="text-lg font-semibold">Prosjekter i perioden</h2>

        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-brand-ink/75">Ingen timeregistreringer i valgt periode.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-brand-canvas text-xs uppercase tracking-wider text-brand-ink/70">
                <tr>
                  <th className="px-3 py-2">Prosjekt</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Registreringer</th>
                  <th className="px-3 py-2">Timer</th>
                  <th className="px-3 py-2">Belop (alle)</th>
                  <th className="px-3 py-2">Fakturer naa</th>
                  <th className="px-3 py-2">Fastpris-forbruk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const fastprisText =
                    row.project.billingType === "FASTPRIS" && row.project.fastprisBelopEksMva !== null
                      ? `${formatMoney(row.totalCost)} av ${formatMoney(row.project.fastprisBelopEksMva)}`
                      : "-";

                  return (
                    <tr key={row.project.id} className="border-t border-black/10">
                      <td className="px-3 py-2">
                        <Link href={`/prosjekter/${row.project.id}#timer`} className="font-medium hover:underline">
                          {row.project.navn}
                        </Link>
                        <p className="text-xs text-brand-ink/70">{row.project.status}</p>
                      </td>
                      <td className="px-3 py-2">{getProjectBillingTypeLabel(row.project.billingType)}</td>
                      <td className="px-3 py-2">{row.entryCount}</td>
                      <td className="px-3 py-2">{formatHours(row.periodHours)} t</td>
                      <td className="px-3 py-2">{formatMoney(row.periodAmount)}</td>
                      <td className="px-3 py-2 font-semibold">{formatMoney(row.billableAmount)}</td>
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
