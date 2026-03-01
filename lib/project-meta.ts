import { ProjectBillingType, ProjectStatus } from "@prisma/client";

export const projectStatusOptions: Array<{ value: ProjectStatus; label: string }> = [
  { value: ProjectStatus.PLANLAGT, label: "Planlagt" },
  { value: ProjectStatus.PAGAR, label: "Pagar" },
  { value: ProjectStatus.FERDIG, label: "Ferdig" },
  { value: ProjectStatus.FAKTURERT, label: "Fakturert" }
];

export const projectBillingTypeOptions: Array<{ value: ProjectBillingType; label: string }> = [
  { value: ProjectBillingType.TIME, label: "Time" },
  { value: ProjectBillingType.FASTPRIS, label: "Fastpris" }
];

export function getProjectStatusLabel(status: ProjectStatus): string {
  const entry = projectStatusOptions.find((item) => item.value === status);
  return entry?.label ?? status;
}

export function getProjectBillingTypeLabel(type: ProjectBillingType): string {
  const entry = projectBillingTypeOptions.find((item) => item.value === type);
  return entry?.label ?? type;
}
