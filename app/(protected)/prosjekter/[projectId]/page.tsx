import Link from "next/link";
import { notFound } from "next/navigation";

import { createAvvikAction } from "@/app/actions/avvik-actions";
import {
  createProjectChecklistFromScratchAction,
  createProjectChecklistFromTemplateAction
} from "@/app/actions/checklist-actions";
import { createMaterialAction, deleteMaterialAction, updateMaterialStatusAction } from "@/app/actions/material-actions";
import { createProjectFinanceEntryAction, deleteProjectFinanceEntryAction, updateProjectFinanceEntryAction } from "@/app/actions/project-finance-actions";
import { deleteProjectAction, updateProjectAction } from "@/app/actions/project-actions";
import { createTimeEntryAction, deleteTimeEntryAction } from "@/app/actions/time-entry-actions";
import { avvikAlvorlighetsgradOptions, getAvvikAlvorlighetsgradColor, getAvvikAlvorlighetsgradLabel, getAvvikStatusColor, getAvvikStatusLabel } from "@/lib/avvik-meta";
import { db } from "@/lib/db";
import { getMaterialStatusColor, getMaterialStatusLabel, materialStatusOptions } from "@/lib/material-meta";
import { getProjectFinanceEntryTypeColor, getProjectFinanceEntryTypeLabel, projectFinanceEntryTypeOptions } from "@/lib/project-finance-meta";
import { getProjectBillingTypeLabel, getProjectStatusLabel, projectBillingTypeOptions, projectStatusOptions } from "@/lib/project-meta";
import { requireAuthPage } from "@/lib/rbac";
import { buildPeriodOptions, formatDateInput, get14DayPeriodFromInput, shiftPeriod } from "@/lib/time-period";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSuccessMessage(success: string): string | null {
  if (success === "created") return "Prosjektet ble opprettet.";
  if (success === "updated") return "Prosjektet ble oppdatert.";
  if (success === "time-created") return "Timer ble registrert.";
  if (success === "time-deleted") return "Timeregistrering ble slettet.";
  if (success === "avvik-created") return "Avvik ble registrert.";
  if (success === "avvik-deleted") return "Avvik ble slettet.";
  if (success === "material-created") return "Material ble lagt til.";
  if (success === "material-updated") return "Materialstatus ble oppdatert.";
  if (success === "material-deleted") return "Material ble slettet.";
  if (success === "finance-created") return "Okonomipost ble lagt til.";
  if (success === "finance-updated") return "Okonomipost ble oppdatert.";
  if (success === "finance-deleted") return "Okonomipost ble slettet.";
  return null;
}

function nextMaterialStatus(current: string): string | null {
  if (current === "TRENGS") return "BESTILT";
  if (current === "BESTILT") return "MOTTATT";
  return null;
}

function toDateInputValue(date: Date | null): string {
  if (!date) {
    return "";
  }
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(amount: number | null): string {
  if (amount === null) return "-";
  return `${amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function formatHours(value: number): string {
  return value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const session = await requireAuthPage();
  const { projectId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};

  const error = toSingleValue(resolvedSearchParams.error);
  const success = getSuccessMessage(toSingleValue(resolvedSearchParams.success));
  const warning = toSingleValue(resolvedSearchParams.warning);

  const activePeriod = get14DayPeriodFromInput(toSingleValue(resolvedSearchParams.periodStart));
  const periodStartValue = formatDateInput(activePeriod.start);
  const periodOptions = buildPeriodOptions(activePeriod, 4, 4);
  const previousPeriod = shiftPeriod(activePeriod, -1);
  const nextPeriod = shiftPeriod(activePeriod, 1);
  const todayValue = formatDateInput(new Date());

  const [project, customers, templates, periodTimeEntries, totalTimeSummary, totalBillableSummary, avvikList, materialList, financeEntries] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      include: {
        customer: {
          select: {
            id: true,
            navn: true,
            adresse: true,
            postnr: true,
            poststed: true
          }
        },
        checklists: {
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true
              }
            },
            items: {
              select: {
                id: true,
                svar: true
              }
            }
          }
        }
      }
    }),
    db.customer.findMany({
      where: { status: "ACTIVE" },
      orderBy: { navn: "asc" },
      select: {
        id: true,
        navn: true
      }
    }),
    db.checklistTemplate.findMany({
      orderBy: [{ kategori: "asc" }, { navn: "asc" }],
      include: {
        items: {
          orderBy: { rekkefolge: "asc" },
          select: { id: true }
        }
      }
    }),
    db.timeEntry.findMany({
      where: {
        projectId,
        dato: {
          gte: activePeriod.start,
          lt: activePeriod.endExclusive
        }
      },
      orderBy: [{ dato: "desc" }, { createdAt: "desc" }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    }),
    db.timeEntry.aggregate({
      where: { projectId },
      _sum: {
        timer: true,
        belopEksMva: true
      }
    }),
    db.timeEntry.aggregate({
      where: {
        projectId,
        fakturerbar: true
      },
      _sum: {
        belopEksMva: true
      }
    }),
    db.avvik.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }],
      include: {
        registrertAv: { select: { name: true } },
        attachments: { select: { id: true } }
      }
    }),
    db.materialItem.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        lagtTilAv: { select: { name: true } }
      }
    }),
    db.projectFinanceEntry.findMany({
      where: { projectId },
      orderBy: [{ dato: "desc" }, { createdAt: "desc" }],
      include: {
        createdBy: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })
  ]);

  if (!project) {
    notFound();
  }

  const inheritedAddress = `${project.customer.adresse}, ${project.customer.postnr} ${project.customer.poststed}`;
  const effectiveAddress = project.adresse?.trim() || inheritedAddress;

  const periodSummary = periodTimeEntries.reduce(
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

  const totalHoursToDate = totalTimeSummary._sum.timer ?? 0;
  const totalAmountToDate = totalTimeSummary._sum.belopEksMva ?? 0;
  const totalBillableToDate = totalBillableSummary._sum.belopEksMva ?? 0;

  const financeTotals = financeEntries.reduce(
    (accumulator, entry) => {
      if (entry.type === "UTGIFT") {
        accumulator.expenses += entry.belopEksMva;
      } else {
        accumulator.surcharges += entry.belopEksMva;
      }
      return accumulator;
    },
    { expenses: 0, surcharges: 0 }
  );

  const baseRevenue =
    project.billingType === "FASTPRIS"
      ? (project.fastprisBelopEksMva ?? 0)
      : totalBillableToDate;
  const totalRevenue = baseRevenue + financeTotals.surcharges;
  const totalCost = totalAmountToDate + financeTotals.expenses;
  const resultEksMva = totalRevenue - totalCost;
  const isPositiveResult = resultEksMva >= 0;

  const fastprisConsumption = project.billingType === "FASTPRIS" && project.fastprisBelopEksMva !== null
    ? {
        fastpris: project.fastprisBelopEksMva + financeTotals.surcharges,
        consumed: totalAmountToDate + financeTotals.expenses,
        remaining: project.fastprisBelopEksMva + financeTotals.surcharges - (totalAmountToDate + financeTotals.expenses),
        percent:
          project.fastprisBelopEksMva + financeTotals.surcharges > 0
            ? ((totalAmountToDate + financeTotals.expenses) / (project.fastprisBelopEksMva + financeTotals.surcharges)) * 100
            : 0
      }
    : null;

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">{project.navn}</h1>
            <p className="mt-1 text-sm text-brand-ink/80">{project.customer.navn}</p>
            <p className="text-sm text-brand-ink/70">{effectiveAddress}</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-brand-canvas px-2 py-1">{getProjectBillingTypeLabel(project.billingType)}</span>
            <span className="rounded-full bg-brand-canvas px-2 py-1">{getProjectStatusLabel(project.status)}</span>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
      {warning ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{warning}</p> : null}

      <div className="brand-card p-3">
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Prosjektseksjoner">
          <a href="#oversikt" className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
            Oversikt
          </a>
          <a href="#sjekklister" className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
            Sjekklister
          </a>
          <a href="#timer" className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
            Timer
          </a>
          <a href="#okonomi" className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
            Okonomi
          </a>
          <a href="#avvik" className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
            Avvik/HMS
          </a>
          <a href="#materialer" className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
            Materialer
          </a>
          <a href="#dokumenter" className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
            Dokumenter
          </a>
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form id="oversikt" action={updateProjectAction} className="brand-card space-y-3 p-4">
          <input type="hidden" name="projectId" value={project.id} />

          <h2 className="text-lg font-semibold">Oversikt</h2>
          <label className="block text-sm font-medium">
            Kunde
            <select name="customerId" className="brand-input mt-1" defaultValue={project.customerId} required>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.navn}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Navn
            <input name="navn" defaultValue={project.navn} className="brand-input mt-1" required minLength={2} maxLength={150} />
          </label>
          <label className="block text-sm font-medium">
            Beskrivelse (valgfritt)
            <textarea name="beskrivelse" defaultValue={project.beskrivelse ?? ""} className="brand-input mt-1 min-h-24 resize-y" maxLength={4000} />
          </label>
          <label className="block text-sm font-medium">
            Adresseoverstyring (valgfritt)
            <input name="adresse" defaultValue={project.adresse ?? ""} className="brand-input mt-1" maxLength={300} placeholder={inheritedAddress} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Status
              <select name="status" className="brand-input mt-1" defaultValue={project.status}>
                {projectStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Billingtype
              <select name="billingType" className="brand-input mt-1" defaultValue={project.billingType}>
                {projectBillingTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Fastpris eks mva
              <input
                name="fastprisBelopEksMva"
                type="number"
                step="0.01"
                min="0"
                defaultValue={project.fastprisBelopEksMva === null ? "" : project.fastprisBelopEksMva}
                className="brand-input mt-1"
              />
            </label>
            <label className="block text-sm font-medium">
              Timepris eks mva
              <input
                name="timeprisEksMva"
                type="number"
                step="0.01"
                min="0"
                defaultValue={project.timeprisEksMva === null ? "" : project.timeprisEksMva}
                className="brand-input mt-1"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Startdato
              <input name="startDato" type="date" defaultValue={toDateInputValue(project.startDato)} className="brand-input mt-1" required />
            </label>
            <label className="block text-sm font-medium">
              Sluttdato (valgfritt)
              <input name="sluttDato" type="date" defaultValue={toDateInputValue(project.sluttDato)} className="brand-input mt-1" />
            </label>
          </div>

          <button type="submit" className="brand-button w-full">
            Lagre prosjekt
          </button>
        </form>

        <div className="space-y-4">
          <div className="brand-card space-y-2 p-4 text-sm">
            <h2 className="text-lg font-semibold">Nokkeltall</h2>
            <p>Type: {getProjectBillingTypeLabel(project.billingType)}</p>
            <p>Status: {getProjectStatusLabel(project.status)}</p>
            <p>Timepris: {formatMoney(project.timeprisEksMva)}</p>
            <p>Fastpris: {formatMoney(project.fastprisBelopEksMva)}</p>
            <p>Total timer (alle perioder): {formatHours(totalHoursToDate)} t</p>
            <p>Total verdi (alle perioder): {formatMoney(totalAmountToDate)}</p>
            <p>Tillegg (inntekt): {formatMoney(financeTotals.surcharges)}</p>
            <p>Ekstra utgifter: {formatMoney(financeTotals.expenses)}</p>
            <p className={isPositiveResult ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
              Resultat eks mva: {formatMoney(resultEksMva)}
            </p>
          </div>

          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Slett prosjekt</h2>
            <p className="mt-2 text-sm text-brand-ink/75">Sletting fjerner prosjektet permanent.</p>
            <form action={deleteProjectAction} className="mt-3">
              <input type="hidden" name="projectId" value={project.id} />
              <button type="submit" className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                Slett prosjekt
              </button>
            </form>
          </div>
        </div>
      </div>

      <div id="sjekklister" className="space-y-4">
        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Sjekklister</h2>
          <p className="mt-2 text-sm text-brand-ink/75">Opprett fra mal eller fra scratch. Alle innloggede brukere kan jobbe med prosjektets sjekklister.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <form action={createProjectChecklistFromTemplateAction} className="brand-card space-y-3 p-4">
            <input type="hidden" name="projectId" value={project.id} />
            <h3 className="text-lg font-semibold">Fra mal</h3>
            <label className="block text-sm font-medium">
              Mal
              <select name="templateId" className="brand-input mt-1" required>
                <option value="">Velg mal</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.kategori} - {template.navn} ({template.items.length} punkter)
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Navn pa sjekkliste (valgfritt)
              <input name="navn" className="brand-input mt-1" maxLength={150} />
            </label>
            <button type="submit" className="brand-button w-full" disabled={templates.length === 0}>
              Opprett fra mal
            </button>
          </form>

          <form action={createProjectChecklistFromScratchAction} className="brand-card space-y-3 p-4">
            <input type="hidden" name="projectId" value={project.id} />
            <h3 className="text-lg font-semibold">Fra scratch</h3>
            <label className="block text-sm font-medium">
              Navn pa sjekkliste
              <input name="navn" className="brand-input mt-1" required minLength={2} maxLength={150} />
            </label>
            <label className="block text-sm font-medium">
              Punkter (ett punkt per linje)
              <textarea name="punkter" className="brand-input mt-1 min-h-32 resize-y" required />
            </label>
            <button type="submit" className="brand-button w-full">
              Opprett fra scratch
            </button>
          </form>
        </div>

        <div className="brand-card p-4">
          <h3 className="text-lg font-semibold">Eksisterende sjekklister</h3>
          {project.checklists.length === 0 ? (
            <p className="mt-2 text-sm text-brand-ink/75">Ingen sjekklister opprettet pa prosjektet enna.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {project.checklists.map((checklist) => {
                const answered = checklist.items.filter((item) => item.svar !== null).length;
                const total = checklist.items.length;

                return (
                  <Link
                    key={checklist.id}
                    href={`/prosjekter/${project.id}/sjekklister/${checklist.id}`}
                    className="block rounded-xl border border-black/10 p-3 transition hover:border-brand-red/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{checklist.navn}</p>
                      <span className="rounded-full bg-brand-canvas px-2.5 py-1 text-xs font-semibold">
                        {answered}/{total} besvart
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-brand-ink/75">
                      Opprettet av {checklist.createdBy.name} - {checklist.createdAt.toLocaleDateString("nb-NO")}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div id="timer" className="space-y-4">
        <div className="brand-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Timer</h2>
              <p className="mt-2 text-sm text-brand-ink/75">
                Fakturagrunnlag i 14-dagersperioder. Ansatt registreres automatisk som innlogget bruker ({session.user.name ?? session.user.email}).
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <Link
                href={`/prosjekter/${project.id}?periodStart=${formatDateInput(previousPeriod.start)}#timer`}
                className="rounded-lg px-3 py-2 hover:bg-brand-canvas"
              >
                Forrige
              </Link>
              <Link
                href={`/prosjekter/${project.id}?periodStart=${formatDateInput(nextPeriod.start)}#timer`}
                className="rounded-lg px-3 py-2 hover:bg-brand-canvas"
              >
                Neste
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form action={createTimeEntryAction} className="brand-card space-y-3 p-4">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="returnTo" value="project" />
            <input type="hidden" name="periodStart" value={periodStartValue} />

            <h3 className="text-lg font-semibold">Legg til timer</h3>
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
              <input
                name="belopEksMva"
                type="number"
                step="0.01"
                min="0"
                className="brand-input mt-1"
                placeholder={project.timeprisEksMva ? `Auto: timepris ${project.timeprisEksMva.toFixed(2)} * timer` : "Auto: 0.00"}
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="fakturerbar" defaultChecked />
              Fakturerbar
            </label>

            <button type="submit" className="brand-button w-full">
              Registrer timer
            </button>
          </form>

          <div className="space-y-3">
            <div className="brand-card p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Denne perioden</h3>
                  <p className="text-sm text-brand-ink/75">
                    {formatDateInput(activePeriod.start)} til {formatDateInput(activePeriod.endInclusive)}
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
                  <p className="mt-1 font-semibold">{formatHours(periodSummary.hours)} t</p>
                </div>
                <div className="rounded-lg bg-brand-canvas p-3">
                  <p className="text-xs uppercase text-brand-ink/70">Belop (alle)</p>
                  <p className="mt-1 font-semibold">{formatMoney(periodSummary.totalAmount)}</p>
                </div>
                <div className="rounded-lg bg-brand-canvas p-3">
                  <p className="text-xs uppercase text-brand-ink/70">Fakturagrunnlag</p>
                  <p className="mt-1 font-semibold">{formatMoney(periodSummary.billableAmount)}</p>
                </div>
              </div>

              {fastprisConsumption ? (
                <div className="mt-3 rounded-lg border border-black/10 p-3 text-sm">
                  <p className="font-semibold">Fastpris-forbruk (timer + utgifter mot fastpris + tillegg)</p>
                  <p className="mt-1">Forbruk hittil: {formatMoney(fastprisConsumption.consumed)} av {formatMoney(fastprisConsumption.fastpris)}</p>
                  <p>
                    {fastprisConsumption.remaining >= 0
                      ? `Gjenstaende bunnlinje: ${formatMoney(fastprisConsumption.remaining)}`
                      : `Overkjoring: ${formatMoney(Math.abs(fastprisConsumption.remaining))}`}
                  </p>
                  <p>Forbruk: {fastprisConsumption.percent.toFixed(1)}%</p>
                </div>
              ) : null}
            </div>

            <div className="brand-card p-4">
              <h3 className="text-lg font-semibold">Timeliste</h3>
              {periodTimeEntries.length === 0 ? (
                <p className="mt-2 text-sm text-brand-ink/75">Ingen timer registrert i valgt periode.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {periodTimeEntries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-black/10 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{entry.user.name}</p>
                          <p className="text-xs text-brand-ink/70">{entry.user.email}</p>
                        </div>
                        <div className="text-right text-sm">
                          <p>{entry.dato.toLocaleDateString("nb-NO")}</p>
                          <p>{formatHours(entry.timer)} t</p>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-brand-ink/80">{entry.beskrivelse || "Ingen beskrivelse"}</p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-brand-canvas px-2 py-1 text-xs">{entry.fakturerbar ? "Fakturerbar" : "Ikke fakturerbar"}</span>
                          <span className="font-semibold">{formatMoney(entry.belopEksMva)}</span>
                        </div>
                        <form action={deleteTimeEntryAction}>
                          <input type="hidden" name="timeEntryId" value={entry.id} />
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="periodStart" value={periodStartValue} />
                          <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                            Slett
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div id="okonomi" className="space-y-4">
        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Okonomi</h2>
          <p className="mt-2 text-sm text-brand-ink/75">
            Legg inn utgifter (materialkjop, maskinleie, osv.) og tillegg for uforutsette jobber.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form action={createProjectFinanceEntryAction} className="brand-card space-y-3 p-4">
            <input type="hidden" name="projectId" value={project.id} />
            <h3 className="text-lg font-semibold">Ny okonomipost</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Type
                <select name="type" className="brand-input mt-1" defaultValue="UTGIFT">
                  {projectFinanceEntryTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Dato
                <input name="dato" type="date" defaultValue={todayValue} className="brand-input mt-1" required />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Belop eks mva
              <input name="belopEksMva" type="number" step="0.01" min="0.01" className="brand-input mt-1" required />
            </label>
            <label className="block text-sm font-medium">
              Beskrivelse
              <textarea
                name="beskrivelse"
                className="brand-input mt-1 min-h-20 resize-y"
                required
                minLength={2}
                maxLength={400}
                placeholder="Eks: Leie av lift 2 dager / Tillegg for ekstra gravejobb"
              />
            </label>
            <button type="submit" className="brand-button w-full">
              Lagre okonomipost
            </button>
          </form>

          <div className="space-y-3">
            <div className="brand-card p-4">
              <h3 className="text-lg font-semibold">Lonnsomhet eks mva</h3>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-brand-canvas p-3">
                  <p className="text-xs uppercase text-brand-ink/70">Inntekt</p>
                  <p className="mt-1 font-semibold">{formatMoney(totalRevenue)}</p>
                  <p className="mt-1 text-xs text-brand-ink/70">
                    {project.billingType === "FASTPRIS"
                      ? "Fastprisgrunnlag + tillegg"
                      : "Fakturerbare timer + tillegg"}
                  </p>
                </div>
                <div className="rounded-lg bg-brand-canvas p-3">
                  <p className="text-xs uppercase text-brand-ink/70">Kostnad</p>
                  <p className="mt-1 font-semibold">{formatMoney(totalCost)}</p>
                  <p className="mt-1 text-xs text-brand-ink/70">Timer + registrerte utgifter</p>
                </div>
                <div className="rounded-lg bg-brand-canvas p-3">
                  <p className="text-xs uppercase text-brand-ink/70">Tillegg</p>
                  <p className="mt-1 font-semibold text-emerald-700">{formatMoney(financeTotals.surcharges)}</p>
                </div>
                <div className="rounded-lg bg-brand-canvas p-3">
                  <p className="text-xs uppercase text-brand-ink/70">Ekstra utgifter</p>
                  <p className="mt-1 font-semibold text-red-700">{formatMoney(financeTotals.expenses)}</p>
                </div>
              </div>
              <p className={`mt-3 text-sm font-semibold ${isPositiveResult ? "text-emerald-700" : "text-red-700"}`}>
                Resultat: {formatMoney(resultEksMva)} ({isPositiveResult ? "Pluss" : "Minus"})
              </p>
            </div>

            <div className="brand-card p-4">
              <h3 className="text-lg font-semibold">Registrerte okonomiposter</h3>
              {financeEntries.length === 0 ? (
                <p className="mt-2 text-sm text-brand-ink/75">Ingen utgifter eller tillegg registrert enna.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {financeEntries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-black/10 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{entry.beskrivelse}</p>
                          <p className="text-xs text-brand-ink/70">
                            {entry.dato.toLocaleDateString("nb-NO")} - registrert av {entry.createdBy.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getProjectFinanceEntryTypeColor(entry.type)}`}>
                            {getProjectFinanceEntryTypeLabel(entry.type)}
                          </span>
                          <p className={`mt-1 text-sm font-semibold ${entry.type === "TILLEGG" ? "text-emerald-700" : "text-red-700"}`}>
                            {entry.type === "TILLEGG" ? "+" : "-"}
                            {formatMoney(entry.belopEksMva)}
                          </p>
                        </div>
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-brand-ink/80">Rediger</summary>
                        <form action={updateProjectFinanceEntryAction} className="mt-2 space-y-2">
                          <input type="hidden" name="financeEntryId" value={entry.id} />
                          <input type="hidden" name="projectId" value={project.id} />
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <label className="block text-xs font-medium">
                              Type
                              <select name="type" className="brand-input mt-1 text-xs" defaultValue={entry.type}>
                                {projectFinanceEntryTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block text-xs font-medium">
                              Dato
                              <input name="dato" type="date" className="brand-input mt-1 text-xs" defaultValue={formatDateInput(entry.dato)} required />
                            </label>
                            <label className="block text-xs font-medium">
                              Belop eks mva
                              <input
                                name="belopEksMva"
                                type="number"
                                step="0.01"
                                min="0.01"
                                className="brand-input mt-1 text-xs"
                                defaultValue={entry.belopEksMva}
                                required
                              />
                            </label>
                          </div>
                          <label className="block text-xs font-medium">
                            Beskrivelse
                            <textarea
                              name="beskrivelse"
                              className="brand-input mt-1 min-h-16 resize-y text-xs"
                              required
                              minLength={2}
                              maxLength={400}
                              defaultValue={entry.beskrivelse}
                            />
                          </label>
                          <button type="submit" className="rounded-lg bg-brand-canvas px-3 py-1.5 text-xs font-semibold hover:bg-brand-canvas/80">
                            Lagre endringer
                          </button>
                        </form>
                      </details>
                      <form action={deleteProjectFinanceEntryAction} className="mt-2">
                        <input type="hidden" name="financeEntryId" value={entry.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                          Slett
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div id="avvik" className="space-y-4">
        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Avvik/HMS</h2>
          <p className="mt-2 text-sm text-brand-ink/75">Registrer avvik, HMS-hendelser og observasjoner.</p>
        </div>

        <form action={createAvvikAction} className="brand-card space-y-3 p-4">
          <input type="hidden" name="projectId" value={project.id} />
          <h3 className="text-lg font-semibold">Nytt avvik</h3>
          <label className="block text-sm font-medium">
            Tittel
            <input name="tittel" className="brand-input mt-1" required minLength={2} maxLength={200} />
          </label>
          <label className="block text-sm font-medium">
            Beskrivelse
            <textarea name="beskrivelse" className="brand-input mt-1 min-h-24 resize-y" required minLength={2} maxLength={4000} />
          </label>
          <label className="block text-sm font-medium">
            Alvorlighetsgrad
            <select name="alvorlighetsgrad" className="brand-input mt-1" required>
              {avvikAlvorlighetsgradOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="brand-button w-full">
            Registrer avvik
          </button>
        </form>

        <div className="brand-card p-4">
          <h3 className="text-lg font-semibold">Registrerte avvik</h3>
          {avvikList.length === 0 ? (
            <p className="mt-2 text-sm text-brand-ink/75">Ingen avvik registrert pa prosjektet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {avvikList.map((avvik) => (
                <Link
                  key={avvik.id}
                  href={`/prosjekter/${project.id}/avvik/${avvik.id}`}
                  className="block rounded-xl border border-black/10 p-3 transition hover:border-brand-red/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{avvik.tittel}</p>
                    <div className="flex gap-1.5">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getAvvikAlvorlighetsgradColor(avvik.alvorlighetsgrad)}`}>
                        {getAvvikAlvorlighetsgradLabel(avvik.alvorlighetsgrad)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getAvvikStatusColor(avvik.status)}`}>
                        {getAvvikStatusLabel(avvik.status)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-brand-ink/75">
                    {avvik.registrertAv.name} - {avvik.createdAt.toLocaleDateString("nb-NO")}
                    {avvik.attachments.length > 0 ? ` - ${avvik.attachments.length} bilde(r)` : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div id="materialer" className="space-y-4">
        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Materialer</h2>
          <p className="mt-2 text-sm text-brand-ink/75">Materialliste og innkjopsstatus for prosjektet.</p>
        </div>

        <form action={createMaterialAction} className="brand-card space-y-3 p-4">
          <input type="hidden" name="projectId" value={project.id} />
          <h3 className="text-lg font-semibold">Legg til material</h3>
          <label className="block text-sm font-medium">
            Navn/beskrivelse
            <input name="navn" className="brand-input mt-1" required minLength={1} maxLength={200} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Antall
              <input name="antall" type="number" step="0.01" min="0.01" className="brand-input mt-1" required />
            </label>
            <label className="block text-sm font-medium">
              Enhet
              <input name="enhet" className="brand-input mt-1" required minLength={1} maxLength={50} placeholder="stk, m, m2, kg..." />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Estimert pris eks mva (valgfritt)
            <input name="estimertPris" type="number" step="0.01" min="0" className="brand-input mt-1" />
          </label>
          <label className="block text-sm font-medium">
            Notat (valgfritt)
            <textarea name="notat" className="brand-input mt-1 min-h-16 resize-y" maxLength={4000} />
          </label>
          <button type="submit" className="brand-button w-full">
            Legg til material
          </button>
        </form>

        <div className="brand-card p-4">
          <h3 className="text-lg font-semibold">Materialliste</h3>
          {materialList.length === 0 ? (
            <p className="mt-2 text-sm text-brand-ink/75">Ingen materialer lagt til enna.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {materialList.map((item) => {
                const next = nextMaterialStatus(item.status);
                return (
                  <div key={item.id} className="rounded-xl border border-black/10 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{item.navn}</p>
                        <p className="text-sm text-brand-ink/75">
                          {item.antall} {item.enhet}
                          {item.estimertPris !== null ? ` - est. ${formatMoney(item.estimertPris)}` : ""}
                        </p>
                        {item.notat ? <p className="mt-1 text-xs text-brand-ink/70">{item.notat}</p> : null}
                        <p className="mt-1 text-xs text-brand-ink/60">Lagt til av {item.lagtTilAv.name}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getMaterialStatusColor(item.status)}`}>
                        {getMaterialStatusLabel(item.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {next ? (
                        <form action={updateMaterialStatusAction}>
                          <input type="hidden" name="materialId" value={item.id} />
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="status" value={next} />
                          <button type="submit" className="rounded-lg bg-brand-canvas px-3 py-1.5 text-xs font-semibold hover:bg-brand-canvas/80">
                            Merk som {materialStatusOptions.find((o) => o.value === next)?.label ?? next}
                          </button>
                        </form>
                      ) : null}
                      <form action={deleteMaterialAction}>
                        <input type="hidden" name="materialId" value={item.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                          Slett
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
              {(() => {
                const totalEstimert = materialList.reduce((sum, item) => sum + (item.estimertPris ?? 0), 0);
                return totalEstimert > 0 ? (
                  <div className="rounded-lg bg-brand-canvas p-3 text-sm">
                    <p className="font-semibold">Total estimert materialkostnad: {formatMoney(totalEstimert)}</p>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </div>
      </div>

      <div id="dokumenter" className="brand-card space-y-3 p-4">
        <h2 className="text-lg font-semibold">Dokumenter</h2>
        <p className="text-sm text-brand-ink/75">
          Generer en komplett prosjektrapport med sjekklister, bilder, timer og avvik.
        </p>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Sjekklister</p>
            <p className="mt-1 font-semibold">{project.checklists.length}</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Avvik</p>
            <p className="mt-1 font-semibold">{avvikList.length}</p>
          </div>
          <div className="rounded-lg bg-brand-canvas p-3">
            <p className="text-xs uppercase text-brand-ink/70">Materialer</p>
            <p className="mt-1 font-semibold">{materialList.length}</p>
          </div>
        </div>
        <a
          href={`/api/prosjekter/${project.id}/rapport`}
          target="_blank"
          rel="noreferrer"
          className="brand-button inline-block px-4 py-2 text-sm"
        >
          Generer prosjektrapport
        </a>
      </div>
    </section>
  );
}
