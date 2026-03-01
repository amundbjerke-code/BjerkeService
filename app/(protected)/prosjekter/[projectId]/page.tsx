import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createProjectChecklistFromScratchAction,
  createProjectChecklistFromTemplateAction
} from "@/app/actions/checklist-actions";
import { deleteProjectAction, updateProjectAction } from "@/app/actions/project-actions";
import { db } from "@/lib/db";
import { getProjectBillingTypeLabel, getProjectStatusLabel, projectBillingTypeOptions, projectStatusOptions } from "@/lib/project-meta";

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

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};

  const error = toSingleValue(resolvedSearchParams.error);
  const success = getSuccessMessage(toSingleValue(resolvedSearchParams.success));

  const [project, customers, templates] = await Promise.all([
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
    })
  ]);

  if (!project) {
    notFound();
  }

  const inheritedAddress = `${project.customer.adresse}, ${project.customer.postnr} ${project.customer.poststed}`;
  const effectiveAddress = project.adresse?.trim() || inheritedAddress;

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
          <a href="#dokumenter" className="rounded-lg px-3 py-2 hover:bg-brand-canvas">
            Dokumenter/Bilder
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

      <div id="timer" className="brand-card p-4">
        <h2 className="text-lg font-semibold">Timer</h2>
        <p className="mt-2 text-sm text-brand-ink/75">Placeholder til Bolge 5.</p>
      </div>

      <div id="dokumenter" className="brand-card p-4">
        <h2 className="text-lg font-semibold">Dokumenter/Bilder</h2>
        <p className="mt-2 text-sm text-brand-ink/75">Placeholder for dokumenter og bilder.</p>
      </div>
    </section>
  );
}
