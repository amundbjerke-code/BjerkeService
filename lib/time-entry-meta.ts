import { AbsenceType, TimeEntryApprovalStatus } from "@prisma/client";

export const timeEntryApprovalStatusOptions: Array<{ value: TimeEntryApprovalStatus; label: string }> = [
  { value: TimeEntryApprovalStatus.PENDING, label: "Venter godkjenning" },
  { value: TimeEntryApprovalStatus.APPROVED, label: "Godkjent" },
  { value: TimeEntryApprovalStatus.REJECTED, label: "Avvist" }
];

export function getTimeEntryApprovalStatusLabel(status: TimeEntryApprovalStatus): string {
  return timeEntryApprovalStatusOptions.find((entry) => entry.value === status)?.label ?? status;
}

export function getTimeEntryApprovalStatusColor(status: TimeEntryApprovalStatus): string {
  if (status === TimeEntryApprovalStatus.APPROVED) {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === TimeEntryApprovalStatus.REJECTED) {
    return "bg-red-100 text-red-800";
  }
  return "bg-amber-100 text-amber-800";
}

export const absenceTypeOptions: Array<{ value: AbsenceType; label: string }> = [
  { value: AbsenceType.FERIE, label: "Ferie" },
  { value: AbsenceType.SYK, label: "Syk" },
  { value: AbsenceType.PERMISJON, label: "Permisjon" },
  { value: AbsenceType.ANNET, label: "Annet" }
];

export function getAbsenceTypeLabel(type: AbsenceType): string {
  return absenceTypeOptions.find((entry) => entry.value === type)?.label ?? type;
}
