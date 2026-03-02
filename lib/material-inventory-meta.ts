import { PurchaseOrderStatus } from "@prisma/client";

export const purchaseOrderStatusOptions: Array<{ value: PurchaseOrderStatus; label: string }> = [
  { value: PurchaseOrderStatus.UTKAST, label: "Utkast" },
  { value: PurchaseOrderStatus.SENDT, label: "Sendt" },
  { value: PurchaseOrderStatus.MOTTATT, label: "Mottatt" },
  { value: PurchaseOrderStatus.ANNULLERT, label: "Annullert" }
];

export function getPurchaseOrderStatusLabel(status: PurchaseOrderStatus): string {
  return purchaseOrderStatusOptions.find((entry) => entry.value === status)?.label ?? status;
}

export function getPurchaseOrderStatusColor(status: PurchaseOrderStatus): string {
  if (status === PurchaseOrderStatus.MOTTATT) {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === PurchaseOrderStatus.SENDT) {
    return "bg-blue-100 text-blue-800";
  }
  if (status === PurchaseOrderStatus.ANNULLERT) {
    return "bg-neutral-200 text-neutral-700";
  }
  return "bg-amber-100 text-amber-800";
}
