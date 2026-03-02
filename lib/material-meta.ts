import { MaterialStatus } from "@prisma/client";

export const materialStatusOptions: Array<{ value: MaterialStatus; label: string }> = [
  { value: MaterialStatus.TRENGS, label: "Trengs" },
  { value: MaterialStatus.BESTILT, label: "Bestilt" },
  { value: MaterialStatus.MOTTATT, label: "Mottatt" }
];

export function getMaterialStatusLabel(status: MaterialStatus): string {
  const entry = materialStatusOptions.find((item) => item.value === status);
  return entry?.label ?? status;
}

export function getMaterialStatusColor(status: MaterialStatus): string {
  switch (status) {
    case MaterialStatus.TRENGS:
      return "bg-red-100 text-red-800";
    case MaterialStatus.BESTILT:
      return "bg-yellow-100 text-yellow-800";
    case MaterialStatus.MOTTATT:
      return "bg-emerald-100 text-emerald-800";
  }
}
