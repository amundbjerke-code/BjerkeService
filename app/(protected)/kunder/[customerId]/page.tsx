import { CustomerStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  activateCustomerAction,
  deactivateCustomerAction,
  updateCustomerAction
} from "@/app/actions/customer-actions";
import { db } from "@/lib/db";
import { getProjectBillingTypeLabel, getProjectStatusLabel } from "@/lib/project-meta";

type Props = {
  params: Promise<{ customerId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSuccessMessage(success: string): string | null {
  if (success === "created") return "Kunden ble opprettet.";
  if (success === "updated") return "Kunden ble oppdatert.";
  if (success === "deactivated") return "Kunden ble deaktivert.";
  if (success === "activated") return "Kunden ble aktivert.";
  return null;
}

function toDialHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export default async function CustomerDetailPage({ params, searchParams }: Props) {
  const { customerId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};

  const error = toSingleValue(resolvedSearchParams.error);
  const success = getSuccessMessage(toSingleValue(resolvedSearchParams.success));

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      projects: {
        orderBy: [{ status: "asc" }, { startDato: "desc" }],
        select: {
          id: true,
          navn: true,
          status: true,
          billingType: true,
          startDato: true
        }
      }
    }
  });

  if (!customer) {
    notFound();
  }

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">{customer.navn}</h1>
            <p className="mt-1 text-sm text-brand-ink/80">{customer.adresse}</p>
            <p className="text-sm text-brand-ink/80">
              {customer.postnr} {customer.poststed}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              customer.status === CustomerStatus.ACTIVE ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            {customer.status === CustomerStatus.ACTIVE ? "Aktiv" : "Inaktiv"}
          </span>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form action={updateCustomerAction} className="brand-card space-y-3 p-4">
          <input type="hidden" name="customerId" value={customer.id} />

          <h2 className="text-lg font-semibold">Kundedetaljer</h2>
          <label className="block text-sm font-medium">
            Navn
            <input name="navn" defaultValue={customer.navn} className="brand-input mt-1" required minLength={2} maxLength={120} />
          </label>
          <label className="block text-sm font-medium">
            Org.nr (valgfritt)
            <input name="orgnr" defaultValue={customer.orgnr ?? ""} className="brand-input mt-1" maxLength={30} />
          </label>
          <label className="block text-sm font-medium">
            E-post
            <input name="epost" type="email" defaultValue={customer.epost} className="brand-input mt-1" required maxLength={200} />
          </label>
          <label className="block text-sm font-medium">
            Telefon
            <input name="telefon" defaultValue={customer.telefon} className="brand-input mt-1" required minLength={5} maxLength={40} />
          </label>
          <label className="block text-sm font-medium">
            Adresse
            <input name="adresse" defaultValue={customer.adresse} className="brand-input mt-1" required minLength={2} maxLength={200} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Postnr
              <input name="postnr" defaultValue={customer.postnr} className="brand-input mt-1" required minLength={2} maxLength={12} />
            </label>
            <label className="block text-sm font-medium">
              Poststed
              <input
                name="poststed"
                defaultValue={customer.poststed}
                className="brand-input mt-1"
                required
                minLength={2}
                maxLength={120}
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Notater (valgfritt)
            <textarea name="notater" defaultValue={customer.notater ?? ""} className="brand-input mt-1 min-h-24 resize-y" maxLength={4000} />
          </label>

          <button type="submit" className="brand-button w-full">
            Lagre endringer
          </button>
        </form>

        <div className="space-y-4">
          <div className="brand-card space-y-3 p-4">
            <h2 className="text-lg font-semibold">Kontakt</h2>
            <a href={toDialHref(customer.telefon)} className="brand-button block text-center">
              Ring {customer.telefon}
            </a>
            <a
              href={`mailto:${customer.epost}`}
              className="block rounded-xl border border-brand-red px-3 py-2 text-center text-sm font-semibold text-brand-red"
            >
              Send e-post
            </a>
          </div>

          <div className="brand-card space-y-3 p-4">
            <h2 className="text-lg font-semibold">Status</h2>
            <p className="text-sm text-brand-ink/80">Deaktivering skjuler ikke kunden, men markerer den som inaktiv.</p>
            {customer.status === CustomerStatus.ACTIVE ? (
              <form action={deactivateCustomerAction}>
                <input type="hidden" name="customerId" value={customer.id} />
                <button type="submit" className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  Deaktiver kunde
                </button>
              </form>
            ) : (
              <form action={activateCustomerAction}>
                <input type="hidden" name="customerId" value={customer.id} />
                <button
                  type="submit"
                  className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
                >
                  Aktiver kunde
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="brand-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Prosjekter</h2>
          <Link href={`/prosjekter?customerId=${customer.id}`} className="rounded-lg px-3 py-2 text-sm font-medium text-brand-ink hover:bg-brand-canvas">
            Se alle prosjekter
          </Link>
        </div>

        {customer.projects.length === 0 ? (
          <p className="mt-2 text-sm text-brand-ink/75">Ingen prosjekter registrert pa denne kunden enna.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {customer.projects.map((project) => (
              <Link key={project.id} href={`/prosjekter/${project.id}`} className="block rounded-xl border border-black/10 p-3 transition hover:border-brand-red/40">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{project.navn}</p>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-full bg-brand-canvas px-2 py-1">{getProjectStatusLabel(project.status)}</span>
                    <span className="rounded-full bg-brand-canvas px-2 py-1">{getProjectBillingTypeLabel(project.billingType)}</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-brand-ink/75">Start: {project.startDato.toLocaleDateString("nb-NO")}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
