import { ProjectStatus, Prisma } from "@prisma/client";
import Link from "next/link";

import { createProjectAction } from "@/app/actions/project-actions";
import { db } from "@/lib/db";
import { getProjectBillingTypeLabel, getProjectStatusLabel, projectBillingTypeOptions, projectStatusOptions } from "@/lib/project-meta";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStatusFilter(rawValue: string): "ALL" | ProjectStatus {
  if (
    rawValue === ProjectStatus.PLANLAGT ||
    rawValue === ProjectStatus.PAGAR ||
    rawValue === ProjectStatus.FERDIG ||
    rawValue === ProjectStatus.FAKTURERT
  ) {
    return rawValue;
  }
  return "ALL";
}

function getSuccessMessage(success: string): string | null {
  if (success === "deleted") return "Prosjektet ble slettet.";
  return null;
}

function formatMoney(amount: number | null): string {
  if (amount === null) return "-";
  return `${amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

export default async function ProsjekterPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const query = toSingleValue(params.q);
  const statusFilter = getStatusFilter(toSingleValue(params.status).toUpperCase());
  const customerIdFilter = toSingleValue(params.customerId);
  const error = toSingleValue(params.error);
  const success = getSuccessMessage(toSingleValue(params.success));

  const customers = await db.customer.findMany({
    where: { status: "ACTIVE" },
    orderBy: { navn: "asc" },
    select: {
      id: true,
      navn: true,
      adresse: true,
      postnr: true,
      poststed: true
    }
  });

  const where: Prisma.ProjectWhereInput = {};
  if (statusFilter !== "ALL") {
    where.status = statusFilter;
  }
  if (customerIdFilter.length > 0) {
    where.customerId = customerIdFilter;
  }
  if (query.length > 0) {
    where.OR = [{ navn: { contains: query, mode: "insensitive" } }, { customer: { navn: { contains: query, mode: "insensitive" } } }];
  }

  const projects = await db.project.findMany({
    where,
    orderBy: [{ status: "asc" }, { startDato: "desc" }],
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
  });

  const defaultCustomer = customers.find((customer) => customer.id === customerIdFilter) ?? customers[0] ?? null;
  const defaultStartDate = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <h1 className="text-xl font-bold text-brand-ink">Prosjekter</h1>
        <p className="mt-2 text-sm text-brand-ink/80">Opprett og administrer prosjekter med status, billingtype og datoer.</p>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form action={createProjectAction} className="brand-card space-y-3 p-4">
          <h2 className="text-lg font-semibold">Nytt prosjekt</h2>
          <label className="block text-sm font-medium">
            Kunde
            <select name="customerId" className="brand-input mt-1" defaultValue={defaultCustomer?.id ?? ""} required>
              {customers.length === 0 ? <option value="">Ingen aktive kunder</option> : null}
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.navn}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Navn
            <input name="navn" className="brand-input mt-1" required minLength={2} maxLength={150} />
          </label>
          <label className="block text-sm font-medium">
            Beskrivelse (valgfritt)
            <textarea name="beskrivelse" className="brand-input mt-1 min-h-20 resize-y" maxLength={4000} />
          </label>
          <label className="block text-sm font-medium">
            Adresseoverstyring (valgfritt)
            <input
              name="adresse"
              className="brand-input mt-1"
              maxLength={300}
              placeholder={defaultCustomer ? `${defaultCustomer.adresse}, ${defaultCustomer.postnr} ${defaultCustomer.poststed}` : "Bruker kundens adresse"}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Status
              <select name="status" className="brand-input mt-1" defaultValue={ProjectStatus.PLANLAGT}>
                {projectStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Type
              <select name="billingType" className="brand-input mt-1" defaultValue="TIME">
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
              Fastpris eks mva (ved FASTPRIS)
              <input name="fastprisBelopEksMva" type="number" step="0.01" min="0" className="brand-input mt-1" />
            </label>
            <label className="block text-sm font-medium">
              Timepris eks mva
              <input name="timeprisEksMva" type="number" step="0.01" min="0" className="brand-input mt-1" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Startdato
              <input name="startDato" type="date" className="brand-input mt-1" defaultValue={defaultStartDate} required />
            </label>
            <label className="block text-sm font-medium">
              Sluttdato (valgfritt)
              <input name="sluttDato" type="date" className="brand-input mt-1" />
            </label>
          </div>

          <button type="submit" className="brand-button w-full" disabled={customers.length === 0}>
            Opprett prosjekt
          </button>
        </form>

        <div className="space-y-3">
          <form className="brand-card grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_190px_190px_auto]">
            <label className="block text-sm font-medium">
              Sok (prosjekt eller kunde)
              <input name="q" defaultValue={query} className="brand-input mt-1" placeholder="Skriv prosjektnavn eller kundenavn" />
            </label>
            <label className="block text-sm font-medium">
              Status
              <select name="status" defaultValue={statusFilter} className="brand-input mt-1">
                <option value="ALL">Alle</option>
                {projectStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Kunde
              <select name="customerId" defaultValue={customerIdFilter} className="brand-input mt-1">
                <option value="">Alle kunder</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.navn}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" className="brand-button w-full md:w-auto">
                Filtrer
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {projects.length === 0 ? (
              <div className="brand-card p-4 text-sm text-brand-ink/75">Ingen prosjekter matcher filtreringen.</div>
            ) : (
              projects.map((project) => (
                <Link key={project.id} href={`/prosjekter/${project.id}`} className="brand-card block p-4 transition hover:border-brand-red/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-brand-ink">{project.navn}</p>
                      <p className="mt-1 text-sm text-brand-ink/75">{project.customer.navn}</p>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="rounded-full bg-brand-canvas px-2 py-1">{getProjectBillingTypeLabel(project.billingType)}</span>
                      <span className="rounded-full bg-brand-canvas px-2 py-1">{getProjectStatusLabel(project.status)}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-1 text-sm text-brand-ink/80 sm:grid-cols-3">
                    <p>Start: {project.startDato.toLocaleDateString("nb-NO")}</p>
                    <p>Timepris: {formatMoney(project.timeprisEksMva)}</p>
                    <p>Fastpris: {formatMoney(project.fastprisBelopEksMva)}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
