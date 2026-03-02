import { ProjectFinanceEntryType } from "@prisma/client";

export const projectFinanceEntryTypeOptions: Array<{ value: ProjectFinanceEntryType; label: string }> = [
  { value: ProjectFinanceEntryType.UTGIFT, label: "Utgift" },
  { value: ProjectFinanceEntryType.TILLEGG, label: "Tillegg" }
];

export function getProjectFinanceEntryTypeLabel(type: ProjectFinanceEntryType): string {
  return projectFinanceEntryTypeOptions.find((entry) => entry.value === type)?.label ?? type;
}

export function getProjectFinanceEntryTypeColor(type: ProjectFinanceEntryType): string {
  if (type === ProjectFinanceEntryType.UTGIFT) {
    return "bg-red-100 text-red-700";
  }
  return "bg-emerald-100 text-emerald-800";
}
