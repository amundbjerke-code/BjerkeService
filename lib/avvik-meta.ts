import { AvvikAlvorlighetsgrad, AvvikStatus } from "@prisma/client";

export const avvikAlvorlighetsgradOptions: Array<{ value: AvvikAlvorlighetsgrad; label: string }> = [
  { value: AvvikAlvorlighetsgrad.LAV, label: "Lav" },
  { value: AvvikAlvorlighetsgrad.MIDDELS, label: "Middels" },
  { value: AvvikAlvorlighetsgrad.HOY, label: "Hoy" },
  { value: AvvikAlvorlighetsgrad.KRITISK, label: "Kritisk" }
];

export const avvikStatusOptions: Array<{ value: AvvikStatus; label: string }> = [
  { value: AvvikStatus.APENT, label: "Apent" },
  { value: AvvikStatus.UNDER_BEHANDLING, label: "Under behandling" },
  { value: AvvikStatus.LUKKET, label: "Lukket" }
];

export function getAvvikAlvorlighetsgradLabel(grad: AvvikAlvorlighetsgrad): string {
  const entry = avvikAlvorlighetsgradOptions.find((item) => item.value === grad);
  return entry?.label ?? grad;
}

export function getAvvikStatusLabel(status: AvvikStatus): string {
  const entry = avvikStatusOptions.find((item) => item.value === status);
  return entry?.label ?? status;
}

export function getAvvikAlvorlighetsgradColor(grad: AvvikAlvorlighetsgrad): string {
  switch (grad) {
    case AvvikAlvorlighetsgrad.LAV:
      return "bg-blue-100 text-blue-800";
    case AvvikAlvorlighetsgrad.MIDDELS:
      return "bg-yellow-100 text-yellow-800";
    case AvvikAlvorlighetsgrad.HOY:
      return "bg-orange-100 text-orange-800";
    case AvvikAlvorlighetsgrad.KRITISK:
      return "bg-red-100 text-red-800";
  }
}

export function getAvvikStatusColor(status: AvvikStatus): string {
  switch (status) {
    case AvvikStatus.APENT:
      return "bg-red-100 text-red-800";
    case AvvikStatus.UNDER_BEHANDLING:
      return "bg-yellow-100 text-yellow-800";
    case AvvikStatus.LUKKET:
      return "bg-emerald-100 text-emerald-800";
  }
}
