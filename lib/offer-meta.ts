import { OfferStatus, OfferType } from "@prisma/client";

export const offerTypeOptions = [
  { value: OfferType.FASTPRIS, label: "Fastpris" },
  { value: OfferType.TIMEBASERT, label: "Timebasert" }
] as const;

export const offerStatusOptions = [
  { value: OfferStatus.UTKAST, label: "Utkast" },
  { value: OfferStatus.SENDT, label: "Sendt" },
  { value: OfferStatus.GODKJENT, label: "Godkjent" },
  { value: OfferStatus.AVVIST, label: "Avvist" }
] as const;

export function getOfferTypeLabel(type: OfferType): string {
  return offerTypeOptions.find((option) => option.value === type)?.label ?? type;
}

export function getOfferStatusLabel(status: OfferStatus): string {
  return offerStatusOptions.find((option) => option.value === status)?.label ?? status;
}

export function getOfferStatusColor(status: OfferStatus): string {
  if (status === OfferStatus.GODKJENT) return "bg-emerald-100 text-emerald-800";
  if (status === OfferStatus.AVVIST) return "bg-red-100 text-red-700";
  if (status === OfferStatus.SENDT) return "bg-amber-100 text-amber-800";
  return "bg-brand-canvas text-brand-ink";
}
