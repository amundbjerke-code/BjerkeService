import { notFound } from "next/navigation";

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

  const [project, customers] = await Promise.all([
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

      <div id="sjekklister" className="brand-card p-4">
        <h2 className="text-lg font-semibold">Sjekklister</h2>
        <p className="mt-2 text-sm text-brand-ink/75">Placeholder til Bolge 4.</p>
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
