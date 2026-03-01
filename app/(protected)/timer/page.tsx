import Link from "next/link";

import { createTimeEntryAction } from "@/app/actions/time-entry-actions";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";
import { buildPeriodOptions, formatDateInput, get14DayPeriodFromInput, shiftPeriod } from "@/lib/time-period";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSuccessMessage(success: string): string | null {
  if (success === "time-created") return "Timer ble registrert.";
  return null;
}

function formatMoney(amount: number): string {
  return `${amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function formatHours(value: number): string {
  return value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function TimerPage({ searchParams }: Props) {
  const session = await requireAuthPage();
  const params = (await searchParams) ?? {};
  const success = getSuccessMessage(toSingleValue(params.success));

  const period = get14DayPeriodFromInput(toSingleValue(params.periodStart));
  const periodStartValue = formatDateInput(period.start);
  const periodOptions = buildPeriodOptions(period, 4, 4);
  const previousPeriod = shiftPeriod(period, -1);
  const nextPeriod = shiftPeriod(period, 1);
  const todayValue = formatDateInput(new Date());

  const [projects, timeEntries] = await Promise.all([
    db.project.findMany({
      orderBy: [{ status: "asc" }, { navn: "asc" }],
      select: {
        id: true,
        navn: true,
        status: true,
        timeprisEksMva: true
      }
    }),
    db.timeEntry.findMany({
      where: {
        dato: {
          gte: period.start,
          lt: period.endExclusive
        }
      },
      orderBy: [{ dato: "desc" }, { createdAt: "desc" }],
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
            name: true,
            email: true
          }
        }
      }
    })
  ]);

  const totals = timeEntries.reduce(
    (accumulator, entry) => {
      accumulator.hours += entry.timer;
      accumulator.totalAmount += entry.belopEksMva;
      if (entry.fakturerbar) {
        accumulator.billableAmount += entry.belopEksMva;
      }
      return accumulator;
    },
    { hours: 0, totalAmount: 0, billableAmount: 0 }
  );

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">Timer</h1>
            <p className="mt-2 text-sm text-brand-ink/80">
              Superrask registrering pa mobil. Ansatt settes automatisk til innlogget bruker ({session.user.name ?? session.user.email}).
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href={`/timer?periodStart=${formatDateInput(previousPeriod.start)}`} className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
              Forrige
            </Link>
            <Link href={`/timer?periodStart=${formatDateInput(nextPeriod.start)}`} className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
              Neste
            </Link>
          </div>
        </div>
      </div>

      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form action={createTimeEntryAction} className="brand-card space-y-3 p-4">
          <h2 className="text-lg font-semibold">Legg til timer</h2>

          <label className="block text-sm font-medium">
            Prosjekt
            <select name="projectId" className="brand-input mt-1" required>
              <option value="">Velg prosjekt</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.navn}
                </option>
              ))}
            </select>
          </label>

          <input type="hidden" name="periodStart" value={periodStartValue} />
          <input type="hidden" name="returnTo" value="timer" />

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Dato
              <input name="dato" type="date" className="brand-input mt-1" defaultValue={todayValue} required />
            </label>
            <label className="block text-sm font-medium">
              Timer
              <input name="timer" type="number" step="0.25" min="0.25" max="24" className="brand-input mt-1" required />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Beskrivelse/notat
            <textarea name="beskrivelse" className="brand-input mt-1 min-h-20 resize-y" maxLength={4000} />
          </label>

          <label className="block text-sm font-medium">
            Belop eks mva (valgfritt overstyring)
            <input name="belopEksMva" type="number" step="0.01" min="0" className="brand-input mt-1" />
          </label>

          <label className="inline-flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="fakturerbar" defaultChecked />
            Fakturerbar
          </label>

          <button type="submit" className="brand-button w-full" disabled={projects.length === 0}>
            Registrer timer
          </button>
        </form>

        <div className="space-y-3">
          <div className="brand-card p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Denne perioden</h2>
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
                <p className="mt-1 font-semibold">{formatHours(totals.hours)} t</p>
              </div>
              <div className="rounded-lg bg-brand-canvas p-3">
                <p className="text-xs uppercase text-brand-ink/70">Belop (alle)</p>
                <p className="mt-1 font-semibold">{formatMoney(totals.totalAmount)}</p>
              </div>
              <div className="rounded-lg bg-brand-canvas p-3">
                <p className="text-xs uppercase text-brand-ink/70">Fakturagrunnlag</p>
                <p className="mt-1 font-semibold">{formatMoney(totals.billableAmount)}</p>
              </div>
            </div>
          </div>

          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Registreringer</h2>
            {timeEntries.length === 0 ? (
              <p className="mt-2 text-sm text-brand-ink/75">Ingen timer registrert i valgt periode.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {timeEntries.map((entry) => (
                  <Link key={entry.id} href={`/prosjekter/${entry.project.id}?periodStart=${periodStartValue}#timer`} className="block rounded-xl border border-black/10 p-3 transition hover:border-brand-red/40">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{entry.project.navn}</p>
                        <p className="text-xs text-brand-ink/70">{entry.user.name}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p>{entry.dato.toLocaleDateString("nb-NO")}</p>
                        <p>{formatHours(entry.timer)} t</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="rounded-full bg-brand-canvas px-2 py-1 text-xs">{entry.fakturerbar ? "Fakturerbar" : "Ikke fakturerbar"}</span>
                      <span className="font-semibold">{formatMoney(entry.belopEksMva)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
