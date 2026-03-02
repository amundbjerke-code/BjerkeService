import { OfferStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateOfferAction, updateOfferStatusAction } from "@/app/actions/offer-actions";
import { db } from "@/lib/db";
import { DEFAULT_MVA_PERCENT, calculateOfferTotals } from "@/lib/offer-calculation";
import { getOfferStatusColor, getOfferStatusLabel, getOfferTypeLabel, offerTypeOptions } from "@/lib/offer-meta";

const HISTORY_ACTION_LABELS: Record<string, string> = {
  CREATED: "Opprettet",
  UPDATED: "Oppdatert",
  STATUS_CHANGED: "Status endret",
  CONVERTED_TO_PROJECT: "Konvertert til prosjekt"
};

type Props = {
  params: Promise<{ offerId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSuccessMessage(success: string): string | null {
  if (success === "created") return "Tilbudet ble opprettet.";
  if (success === "updated") return "Tilbudet ble oppdatert.";
  if (success === "sent") return "Tilbudet ble satt til Sendt.";
  if (success === "approved") return "Tilbudet ble godkjent og eventuelt konvertert til prosjekt.";
  if (success === "rejected") return "Tilbudet ble satt til Avvist.";
  return null;
}

function formatMoney(amount: number): string {
  return `${amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
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

function buildSpecificationText(items: Array<{ tekst: string; belopEksMva: number | null }>): string {
  return items.map((item) => (typeof item.belopEksMva === "number" ? `${item.tekst};${item.belopEksMva}` : item.tekst)).join("\n");
}

export default async function OfferDetailPage({ params, searchParams }: Props) {
  const { offerId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const error = toSingleValue(resolvedSearchParams.error);
  const success = getSuccessMessage(toSingleValue(resolvedSearchParams.success));

  const [offer, customers] = await Promise.all([
    db.offer.findUnique({
      where: { id: offerId },
      include: {
        customer: true,
        project: {
          select: {
            id: true,
            navn: true,
            status: true,
            startDato: true,
            sluttDato: true
          }
        },
        specificationItems: {
          orderBy: { rekkefolge: "asc" },
          select: {
            id: true,
            tekst: true,
            belopEksMva: true,
            rekkefolge: true
          }
        },
        history: {
          orderBy: { createdAt: "desc" },
          include: {
            changedBy: {
              select: {
                id: true,
                name: true,
                email: true
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
    })
  ]);

  if (!offer) {
    notFound();
  }

  const totals = calculateOfferTotals({
    timeEstimateHours: offer.timeEstimateHours,
    hourlyRateEksMva: offer.hourlyRateEksMva,
    materialCostEksMva: offer.materialCostEksMva,
    markupPercent: offer.markupPercent,
    riskBufferPercent: offer.riskBufferPercent,
    mvaPercent: offer.mvaPercent
  });

  const specificationText = buildSpecificationText(offer.specificationItems);
  const canEdit = offer.status === OfferStatus.UTKAST;

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">{offer.navn}</h1>
            <p className="mt-1 text-sm text-brand-ink/80">{offer.customer.navn}</p>
            <p className="text-sm text-brand-ink/70">Opprettet {offer.createdAt.toLocaleDateString("nb-NO")}</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-brand-canvas px-2 py-1">{getOfferTypeLabel(offer.offerType)}</span>
            <span className={`rounded-full px-2 py-1 ${getOfferStatusColor(offer.status)}`}>{getOfferStatusLabel(offer.status)}</span>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <form action={updateOfferAction} className="brand-card space-y-3 p-4">
          <input type="hidden" name="offerId" value={offer.id} />

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Tilbudsgrunnlag</h2>
            {!canEdit ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Last kun i status Utkast</span> : null}
          </div>

          <label className="block text-sm font-medium">
            Kunde
            <select name="customerId" className="brand-input mt-1" defaultValue={offer.customerId} disabled={!canEdit} required>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.navn}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            Tilbudsnavn
            <input name="navn" defaultValue={offer.navn} className="brand-input mt-1" disabled={!canEdit} required minLength={2} maxLength={160} />
          </label>

          <label className="block text-sm font-medium">
            Beskrivelse (valgfritt)
            <textarea name="beskrivelse" defaultValue={offer.beskrivelse ?? ""} className="brand-input mt-1 min-h-20 resize-y" disabled={!canEdit} maxLength={4000} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Tilbudstype
              <select name="offerType" className="brand-input mt-1" defaultValue={offer.offerType} disabled={!canEdit}>
                {offerTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Timepris eks mva
              <input
                name="hourlyRateEksMva"
                type="number"
                step="0.01"
                min="0"
                className="brand-input mt-1"
                defaultValue={offer.hourlyRateEksMva}
                disabled={!canEdit}
                required
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Timeestimat
              <input name="timeEstimateHours" type="number" step="0.25" min="0" className="brand-input mt-1" defaultValue={offer.timeEstimateHours} disabled={!canEdit} required />
            </label>
            <label className="block text-sm font-medium">
              Materialkost eks mva
              <input
                name="materialCostEksMva"
                type="number"
                step="0.01"
                min="0"
                className="brand-input mt-1"
                defaultValue={offer.materialCostEksMva}
                disabled={!canEdit}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm font-medium">
              Paslag %
              <input name="markupPercent" type="number" step="0.01" min="0" className="brand-input mt-1" defaultValue={offer.markupPercent} disabled={!canEdit} />
            </label>
            <label className="block text-sm font-medium">
              Risiko %
              <input name="riskBufferPercent" type="number" step="0.01" min="0" className="brand-input mt-1" defaultValue={offer.riskBufferPercent} disabled={!canEdit} />
            </label>
            <label className="block text-sm font-medium">
              Mva %
              <input
                name="mvaPercent"
                type="number"
                step="0.01"
                min="0"
                className="brand-input mt-1"
                defaultValue={Number.isFinite(offer.mvaPercent) ? offer.mvaPercent : DEFAULT_MVA_PERCENT}
                disabled={!canEdit}
              />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Spesifikasjon (format: Tekst;Belop)
            <textarea name="specificationText" className="brand-input mt-1 min-h-28 resize-y" defaultValue={specificationText} disabled={!canEdit} />
          </label>

          <button type="submit" className="brand-button w-full" disabled={!canEdit}>
            Lagre tilbud
          </button>
        </form>

        <div className="space-y-4">
          <div className="brand-card space-y-2 p-4 text-sm">
            <h2 className="text-lg font-semibold">Kalkyle</h2>
            <p>Arbeid: {formatMoney(totals.laborCostEksMva)}</p>
            <p>Material: {formatMoney(offer.materialCostEksMva)}</p>
            <p>Subtotal: {formatMoney(offer.subtotalEksMva)}</p>
            <p>Paslag: {formatMoney(offer.markupAmountEksMva)}</p>
            <p>Risiko-buffer: {formatMoney(offer.riskAmountEksMva)}</p>
            <p className="font-semibold">Total eks mva: {formatMoney(offer.totalEksMva)}</p>
            <p className="font-semibold text-brand-red">Total inkl mva: {formatMoney(offer.totalInkMva)}</p>
            <p>Mva: {offer.mvaPercent.toFixed(2)}%</p>
          </div>

          <div className="brand-card space-y-3 p-4 text-sm">
            <h2 className="text-lg font-semibold">Statusflyt</h2>

            {offer.status === OfferStatus.UTKAST ? (
              <form action={updateOfferStatusAction}>
                <input type="hidden" name="offerId" value={offer.id} />
                <input type="hidden" name="targetStatus" value={OfferStatus.SENDT} />
                <button type="submit" className="brand-button w-full">
                  Marker som sendt
                </button>
              </form>
            ) : null}

            {offer.status === OfferStatus.SENDT ? (
              <div className="space-y-2">
                <form action={updateOfferStatusAction}>
                  <input type="hidden" name="offerId" value={offer.id} />
                  <input type="hidden" name="targetStatus" value={OfferStatus.GODKJENT} />
                  <button type="submit" className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    Godkjenn tilbud
                  </button>
                </form>
                <form action={updateOfferStatusAction}>
                  <input type="hidden" name="offerId" value={offer.id} />
                  <input type="hidden" name="targetStatus" value={OfferStatus.AVVIST} />
                  <button type="submit" className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    Avvis tilbud
                  </button>
                </form>
              </div>
            ) : null}

            <a
              href={`/api/offers/${offer.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-block w-full rounded-xl border border-brand-red/30 bg-white px-3 py-2 text-center text-sm font-semibold text-brand-red hover:bg-brand-canvas"
            >
              Generer PDF
            </a>

            {offer.project ? (
              <Link href={`/prosjekter/${offer.project.id}`} className="inline-block w-full rounded-xl bg-brand-canvas px-3 py-2 text-center text-sm font-semibold text-brand-ink hover:bg-brand-canvas/80">
                Gaa til prosjekt: {offer.project.navn}
              </Link>
            ) : (
              <p className="rounded-lg bg-brand-canvas p-2 text-xs text-brand-ink/75">Prosjekt opprettes automatisk nar tilbudet godkjennes.</p>
            )}

            <div className="rounded-lg bg-brand-canvas p-3 text-xs text-brand-ink/75">
              <p>Sendt: {toDateInputValue(offer.sentAt)}</p>
              <p>Godkjent: {toDateInputValue(offer.approvedAt)}</p>
              <p>Avvist: {toDateInputValue(offer.rejectedAt)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="brand-card p-4">
        <h2 className="text-lg font-semibold">Historikk</h2>
        {offer.history.length === 0 ? (
          <p className="mt-2 text-sm text-brand-ink/75">Ingen historikk registrert.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {offer.history.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-black/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-brand-ink">{HISTORY_ACTION_LABELS[entry.action] ?? entry.action}</p>
                  <p className="text-xs text-brand-ink/70">{entry.createdAt.toLocaleString("nb-NO")}</p>
                </div>
                <p className="mt-1 text-sm text-brand-ink/80">
                  Av {entry.changedBy.name} ({entry.changedBy.email})
                </p>
                {entry.fromStatus || entry.toStatus ? (
                  <p className="text-xs text-brand-ink/70">
                    {entry.fromStatus ? getOfferStatusLabel(entry.fromStatus) : "-"}
                    {" -> "}
                    {entry.toStatus ? getOfferStatusLabel(entry.toStatus) : "-"}
                  </p>
                ) : null}
                {entry.note ? <p className="mt-1 text-xs text-brand-ink/70">{entry.note}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
