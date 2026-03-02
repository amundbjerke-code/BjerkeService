import { OfferStatus, OfferType, Prisma } from "@prisma/client";
import Link from "next/link";

import { createOfferAction } from "@/app/actions/offer-actions";
import { db } from "@/lib/db";
import { DEFAULT_MVA_PERCENT } from "@/lib/offer-calculation";
import { getOfferStatusColor, getOfferStatusLabel, getOfferTypeLabel, offerStatusOptions, offerTypeOptions } from "@/lib/offer-meta";

const DEFAULT_HOURLY_RATE = 950;

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStatusFilter(rawValue: string): "ALL" | OfferStatus {
  if (rawValue === OfferStatus.UTKAST || rawValue === OfferStatus.SENDT || rawValue === OfferStatus.GODKJENT || rawValue === OfferStatus.AVVIST) {
    return rawValue;
  }
  return "ALL";
}

function getTypeFilter(rawValue: string): "ALL" | OfferType {
  if (rawValue === OfferType.FASTPRIS || rawValue === OfferType.TIMEBASERT) {
    return rawValue;
  }
  return "ALL";
}

function getSuccessMessage(success: string): string | null {
  if (success === "created") return "Tilbudet ble opprettet.";
  return null;
}

function formatMoney(amount: number): string {
  return `${amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

export default async function TilbudPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const query = toSingleValue(params.q);
  const statusFilter = getStatusFilter(toSingleValue(params.status).toUpperCase());
  const offerTypeFilter = getTypeFilter(toSingleValue(params.offerType).toUpperCase());
  const customerIdFilter = toSingleValue(params.customerId);
  const error = toSingleValue(params.error);
  const success = getSuccessMessage(toSingleValue(params.success));

  const customers = await db.customer.findMany({
    where: { status: "ACTIVE" },
    orderBy: { navn: "asc" },
    select: {
      id: true,
      navn: true
    }
  });

  const where: Prisma.OfferWhereInput = {};
  if (statusFilter !== "ALL") {
    where.status = statusFilter;
  }
  if (offerTypeFilter !== "ALL") {
    where.offerType = offerTypeFilter;
  }
  if (customerIdFilter.length > 0) {
    where.customerId = customerIdFilter;
  }
  if (query.length > 0) {
    where.OR = [{ navn: { contains: query, mode: "insensitive" } }, { customer: { navn: { contains: query, mode: "insensitive" } } }];
  }

  const offers = await db.offer.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    include: {
      customer: {
        select: {
          id: true,
          navn: true
        }
      },
      project: {
        select: {
          id: true,
          navn: true
        }
      }
    }
  });

  const defaultCustomer = customers.find((customer) => customer.id === customerIdFilter) ?? customers[0] ?? null;

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <h1 className="text-xl font-bold text-brand-ink">Tilbud</h1>
        <p className="mt-2 text-sm text-brand-ink/80">Kalkuler tilbud med timer, materialer, paslag og risikobuffer. Godkjente tilbud konverteres automatisk til prosjekt.</p>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form action={createOfferAction} className="brand-card space-y-3 p-4">
          <h2 className="text-lg font-semibold">Nytt tilbud</h2>

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
            Tilbudsnavn
            <input name="navn" className="brand-input mt-1" required minLength={2} maxLength={160} />
          </label>

          <label className="block text-sm font-medium">
            Beskrivelse (valgfritt)
            <textarea name="beskrivelse" className="brand-input mt-1 min-h-20 resize-y" maxLength={4000} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Tilbudstype
              <select name="offerType" className="brand-input mt-1" defaultValue={OfferType.FASTPRIS}>
                {offerTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Timepris eks mva
              <input name="hourlyRateEksMva" type="number" step="0.01" min="0" defaultValue={DEFAULT_HOURLY_RATE} className="brand-input mt-1" required />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Timeestimat
              <input name="timeEstimateHours" type="number" step="0.25" min="0" className="brand-input mt-1" required />
            </label>
            <label className="block text-sm font-medium">
              Materialkost eks mva
              <input name="materialCostEksMva" type="number" step="0.01" min="0" defaultValue="0" className="brand-input mt-1" />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm font-medium">
              Paslag %
              <input name="markupPercent" type="number" step="0.01" min="0" defaultValue="0" className="brand-input mt-1" />
            </label>
            <label className="block text-sm font-medium">
              Risiko %
              <input name="riskBufferPercent" type="number" step="0.01" min="0" defaultValue="0" className="brand-input mt-1" />
            </label>
            <label className="block text-sm font-medium">
              Mva %
              <input name="mvaPercent" type="number" step="0.01" min="0" defaultValue={DEFAULT_MVA_PERCENT} className="brand-input mt-1" />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Spesifikasjon (valgfritt, format: Tekst;Belop)
            <textarea
              name="specificationText"
              className="brand-input mt-1 min-h-28 resize-y"
              placeholder={"Demontering av gammel losning;2500\nKjoretillegg;1200"}
            />
          </label>

          <button type="submit" className="brand-button w-full" disabled={customers.length === 0}>
            Opprett tilbud
          </button>
        </form>

        <div className="space-y-3">
          <form className="brand-card grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_180px_180px_180px_auto]">
            <label className="block text-sm font-medium">
              Sok (tilbud eller kunde)
              <input name="q" defaultValue={query} className="brand-input mt-1" placeholder="Skriv tilbudsnavn eller kundenavn" />
            </label>
            <label className="block text-sm font-medium">
              Status
              <select name="status" defaultValue={statusFilter} className="brand-input mt-1">
                <option value="ALL">Alle</option>
                {offerStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Type
              <select name="offerType" defaultValue={offerTypeFilter} className="brand-input mt-1">
                <option value="ALL">Alle</option>
                {offerTypeOptions.map((option) => (
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
            {offers.length === 0 ? (
              <div className="brand-card p-4 text-sm text-brand-ink/75">Ingen tilbud matcher filtreringen.</div>
            ) : (
              offers.map((offer) => (
                <Link key={offer.id} href={`/tilbud/${offer.id}`} className="brand-card block p-4 transition hover:border-brand-red/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-brand-ink">{offer.navn}</p>
                      <p className="mt-1 text-sm text-brand-ink/75">{offer.customer.navn}</p>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="rounded-full bg-brand-canvas px-2 py-1">{getOfferTypeLabel(offer.offerType)}</span>
                      <span className={`rounded-full px-2 py-1 ${getOfferStatusColor(offer.status)}`}>{getOfferStatusLabel(offer.status)}</span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-1 text-sm text-brand-ink/80 sm:grid-cols-3">
                    <p>Total eks mva: {formatMoney(offer.totalEksMva)}</p>
                    <p>Total inkl mva: {formatMoney(offer.totalInkMva)}</p>
                    <p>{offer.project ? `Prosjekt: ${offer.project.navn}` : "Ikke konvertert"}</p>
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
