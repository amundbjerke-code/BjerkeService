"use server";

import { PurchaseOrderStatus } from "@prisma/client";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

function parseRequiredNumber(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") {
    return Number.NaN;
  }
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return Number.NaN;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return Number(parsed.toFixed(2));
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return Number(parsed.toFixed(2));
}

const createSupplierSchema = z.object({
  navn: z.string().trim().min(2).max(120),
  kontaktperson: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  epost: z
    .string()
    .trim()
    .email()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value && value.length > 0 ? value : null)),
  telefon: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const updateSupplierSchema = createSupplierSchema.extend({
  supplierId: z.string().cuid()
});

const deleteSupplierSchema = z.object({
  supplierId: z.string().cuid()
});

const createInventoryMaterialSchema = z.object({
  supplierId: z.string().cuid(),
  navn: z.string().trim().min(1).max(200),
  enhet: z.string().trim().min(1).max(30),
  innkjopsprisEksMva: z.number().gt(0).max(100000000),
  standardPaslagPercent: z.number().min(0).max(1000),
  lagerBeholdning: z.number().min(0).max(100000000),
  lavLagerGrense: z.number().min(0).max(100000000)
});

const updateInventoryMaterialSchema = z.object({
  materialId: z.string().cuid(),
  supplierId: z.string().cuid(),
  navn: z.string().trim().min(1).max(200),
  enhet: z.string().trim().min(1).max(30),
  innkjopsprisEksMva: z.number().gt(0).max(100000000),
  standardPaslagPercent: z.number().min(0).max(1000),
  lavLagerGrense: z.number().min(0).max(100000000)
});

const deleteInventoryMaterialSchema = z.object({
  materialId: z.string().cuid()
});

const adjustInventoryMaterialStockSchema = z.object({
  materialId: z.string().cuid(),
  delta: z
    .number()
    .min(-100000000)
    .max(100000000)
    .refine((value) => value !== 0),
  reason: z
    .string()
    .trim()
    .min(2)
    .max(300)
});

const createProjectMaterialConsumptionSchema = z.object({
  projectId: z.string().cuid(),
  materialId: z.string().cuid(),
  dato: dateStringSchema,
  antall: z.number().gt(0).max(100000000),
  notat: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const markPurchaseOrderReceivedSchema = z.object({
  purchaseOrderId: z.string().cuid()
});

export async function createSupplierAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = createSupplierSchema.safeParse({
    navn: formData.get("navn"),
    kontaktperson: formData.get("kontaktperson"),
    epost: formData.get("epost"),
    telefon: formData.get("telefon")
  });

  if (!parsed.success) {
    redirect("/materialer?error=Ugyldige%20leverandoropplysninger");
  }

  try {
    const supplier = await db.supplier.create({
      data: {
        navn: parsed.data.navn,
        kontaktperson: parsed.data.kontaktperson,
        epost: parsed.data.epost,
        telefon: parsed.data.telefon
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "SUPPLIER_CREATED",
      entityType: "SUPPLIER",
      entityId: supplier.id,
      metadata: {
        navn: supplier.navn
      }
    });

    redirect("/materialer?success=supplier-created");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20opprette%20leverandor");
  }
}

export async function updateSupplierAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = updateSupplierSchema.safeParse({
    supplierId: formData.get("supplierId"),
    navn: formData.get("navn"),
    kontaktperson: formData.get("kontaktperson"),
    epost: formData.get("epost"),
    telefon: formData.get("telefon")
  });

  if (!parsed.success) {
    redirect("/materialer?error=Ugyldige%20leverandoropplysninger");
  }

  try {
    const existing = await db.supplier.findUnique({
      where: { id: parsed.data.supplierId },
      select: {
        id: true,
        navn: true,
        kontaktperson: true,
        epost: true,
        telefon: true
      }
    });

    if (!existing) {
      redirect("/materialer?error=Leverandor%20ikke%20funnet");
    }

    const updated = await db.supplier.update({
      where: { id: existing.id },
      data: {
        navn: parsed.data.navn,
        kontaktperson: parsed.data.kontaktperson,
        epost: parsed.data.epost,
        telefon: parsed.data.telefon
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "SUPPLIER_UPDATED",
      entityType: "SUPPLIER",
      entityId: updated.id,
      metadata: {
        previous: {
          navn: existing.navn,
          kontaktperson: existing.kontaktperson,
          epost: existing.epost,
          telefon: existing.telefon
        },
        next: {
          navn: updated.navn,
          kontaktperson: updated.kontaktperson,
          epost: updated.epost,
          telefon: updated.telefon
        }
      }
    });

    redirect("/materialer?success=supplier-updated");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20oppdatere%20leverandor");
  }
}

export async function deleteSupplierAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = deleteSupplierSchema.safeParse({
    supplierId: formData.get("supplierId")
  });

  if (!parsed.success) {
    redirect("/materialer?error=Ugyldig%20leverandor");
  }

  try {
    const existing = await db.supplier.findUnique({
      where: { id: parsed.data.supplierId },
      select: {
        id: true,
        navn: true,
        _count: {
          select: {
            materials: true,
            purchaseOrders: true
          }
        }
      }
    });

    if (!existing) {
      redirect("/materialer?error=Leverandor%20ikke%20funnet");
    }

    if (existing._count.materials > 0 || existing._count.purchaseOrders > 0) {
      redirect("/materialer?error=Kan%20ikke%20slette%20leverandor%20med%20materialer%20eller%20innkjopsordre");
    }

    await db.supplier.delete({
      where: { id: existing.id }
    });

    await logAudit({
      actorId: session.user.id,
      action: "SUPPLIER_DELETED",
      entityType: "SUPPLIER",
      entityId: existing.id,
      metadata: {
        navn: existing.navn
      }
    });

    redirect("/materialer?success=supplier-deleted");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20slette%20leverandor");
  }
}

export async function createInventoryMaterialAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = createInventoryMaterialSchema.safeParse({
    supplierId: formData.get("supplierId"),
    navn: formData.get("navn"),
    enhet: formData.get("enhet"),
    innkjopsprisEksMva: parseRequiredNumber(formData.get("innkjopsprisEksMva")),
    standardPaslagPercent: parseOptionalNumber(formData.get("standardPaslagPercent")) ?? 0,
    lagerBeholdning: parseOptionalNumber(formData.get("lagerBeholdning")) ?? 0,
    lavLagerGrense: parseOptionalNumber(formData.get("lavLagerGrense")) ?? 0
  });

  if (!parsed.success) {
    redirect("/materialer?error=Ugyldige%20materialopplysninger");
  }

  try {
    const material = await db.inventoryMaterial.create({
      data: {
        supplierId: parsed.data.supplierId,
        navn: parsed.data.navn,
        enhet: parsed.data.enhet,
        innkjopsprisEksMva: parsed.data.innkjopsprisEksMva,
        standardPaslagPercent: parsed.data.standardPaslagPercent,
        lagerBeholdning: parsed.data.lagerBeholdning,
        lavLagerGrense: parsed.data.lavLagerGrense
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "INVENTORY_MATERIAL_CREATED",
      entityType: "INVENTORY_MATERIAL",
      entityId: material.id,
      metadata: {
        supplierId: material.supplierId,
        navn: material.navn,
        lagerBeholdning: material.lagerBeholdning
      }
    });

    redirect("/materialer?success=material-created");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20opprette%20materiale");
  }
}

export async function updateInventoryMaterialAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = updateInventoryMaterialSchema.safeParse({
    materialId: formData.get("materialId"),
    supplierId: formData.get("supplierId"),
    navn: formData.get("navn"),
    enhet: formData.get("enhet"),
    innkjopsprisEksMva: parseRequiredNumber(formData.get("innkjopsprisEksMva")),
    standardPaslagPercent: parseOptionalNumber(formData.get("standardPaslagPercent")) ?? 0,
    lavLagerGrense: parseOptionalNumber(formData.get("lavLagerGrense")) ?? 0
  });

  if (!parsed.success) {
    redirect("/materialer?error=Ugyldige%20materialopplysninger");
  }

  try {
    const existing = await db.inventoryMaterial.findUnique({
      where: { id: parsed.data.materialId },
      select: {
        id: true,
        supplierId: true,
        navn: true,
        enhet: true,
        innkjopsprisEksMva: true,
        standardPaslagPercent: true,
        lavLagerGrense: true
      }
    });

    if (!existing) {
      redirect("/materialer?error=Materiale%20ikke%20funnet");
    }

    const updated = await db.inventoryMaterial.update({
      where: { id: existing.id },
      data: {
        supplierId: parsed.data.supplierId,
        navn: parsed.data.navn,
        enhet: parsed.data.enhet,
        innkjopsprisEksMva: parsed.data.innkjopsprisEksMva,
        standardPaslagPercent: parsed.data.standardPaslagPercent,
        lavLagerGrense: parsed.data.lavLagerGrense
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "INVENTORY_MATERIAL_UPDATED",
      entityType: "INVENTORY_MATERIAL",
      entityId: updated.id,
      metadata: {
        previous: existing,
        next: {
          supplierId: updated.supplierId,
          navn: updated.navn,
          enhet: updated.enhet,
          innkjopsprisEksMva: updated.innkjopsprisEksMva,
          standardPaslagPercent: updated.standardPaslagPercent,
          lavLagerGrense: updated.lavLagerGrense
        }
      }
    });

    redirect("/materialer?success=material-updated");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20oppdatere%20materiale");
  }
}

export async function deleteInventoryMaterialAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = deleteInventoryMaterialSchema.safeParse({
    materialId: formData.get("materialId")
  });

  if (!parsed.success) {
    redirect("/materialer?error=Ugyldig%20materiale");
  }

  try {
    const existing = await db.inventoryMaterial.findUnique({
      where: { id: parsed.data.materialId },
      select: {
        id: true,
        navn: true,
        _count: {
          select: {
            consumptions: true,
            purchaseOrderItems: true
          }
        }
      }
    });

    if (!existing) {
      redirect("/materialer?error=Materiale%20ikke%20funnet");
    }

    if (existing._count.consumptions > 0 || existing._count.purchaseOrderItems > 0) {
      redirect("/materialer?error=Kan%20ikke%20slette%20materiale%20som%20er%20brukt%20i%20forbruk%20eller%20ordre");
    }

    await db.inventoryMaterial.delete({
      where: { id: existing.id }
    });

    await logAudit({
      actorId: session.user.id,
      action: "INVENTORY_MATERIAL_DELETED",
      entityType: "INVENTORY_MATERIAL",
      entityId: existing.id,
      metadata: {
        navn: existing.navn
      }
    });

    redirect("/materialer?success=material-deleted");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20slette%20materiale");
  }
}

export async function adjustInventoryMaterialStockAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = adjustInventoryMaterialStockSchema.safeParse({
    materialId: formData.get("materialId"),
    delta: parseRequiredNumber(formData.get("delta")),
    reason: formData.get("reason")
  });

  if (!parsed.success) {
    redirect("/materialer?error=Ugyldig%20lagerjustering");
  }

  try {
    const existing = await db.inventoryMaterial.findUnique({
      where: { id: parsed.data.materialId },
      select: {
        id: true,
        navn: true,
        lagerBeholdning: true
      }
    });

    if (!existing) {
      redirect("/materialer?error=Materiale%20ikke%20funnet");
    }

    const nextStock = Number((existing.lagerBeholdning + parsed.data.delta).toFixed(2));
    if (nextStock < 0) {
      redirect("/materialer?error=Lagerbeholdning%20kan%20ikke%20bli%20negativ");
    }

    const updated = await db.inventoryMaterial.update({
      where: { id: existing.id },
      data: {
        lagerBeholdning: nextStock
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "INVENTORY_STOCK_ADJUSTED",
      entityType: "INVENTORY_MATERIAL",
      entityId: updated.id,
      metadata: {
        navn: updated.navn,
        previousStock: existing.lagerBeholdning,
        delta: parsed.data.delta,
        nextStock,
        reason: parsed.data.reason
      }
    });

    redirect("/materialer?success=stock-adjusted");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20justere%20lager");
  }
}

export async function createProjectMaterialConsumptionAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = createProjectMaterialConsumptionSchema.safeParse({
    projectId: formData.get("projectId"),
    materialId: formData.get("materialId"),
    dato: formData.get("dato"),
    antall: parseRequiredNumber(formData.get("antall")),
    notat: formData.get("notat")
  });

  if (!parsed.success) {
    redirect(`/prosjekter/${formData.get("projectId")}?error=Ugyldig%20materialforbruk#materialer`);
  }

  try {
    const material = await db.inventoryMaterial.findUnique({
      where: { id: parsed.data.materialId },
      select: {
        id: true,
        navn: true,
        enhet: true,
        lagerBeholdning: true,
        innkjopsprisEksMva: true,
        standardPaslagPercent: true
      }
    });

    if (!material) {
      redirect(`/prosjekter/${parsed.data.projectId}?error=Materiale%20ikke%20funnet#materialer`);
    }

    if (material.lagerBeholdning < parsed.data.antall) {
      redirect(`/prosjekter/${parsed.data.projectId}?error=Ikke%20nok%20pa%20lager#materialer`);
    }

    const enhetsInnkjopsprisEksMva = Number(material.innkjopsprisEksMva.toFixed(2));
    const enhetsSalgsprisEksMva = Number((material.innkjopsprisEksMva * (1 + material.standardPaslagPercent / 100)).toFixed(2));
    const kostEksMva = Number((parsed.data.antall * enhetsInnkjopsprisEksMva).toFixed(2));

    const created = await db.$transaction(async (tx) => {
      const consumption = await tx.projectMaterialConsumption.create({
        data: {
          projectId: parsed.data.projectId,
          materialId: material.id,
          dato: new Date(`${parsed.data.dato}T00:00:00`),
          antall: parsed.data.antall,
          enhet: material.enhet,
          enhetsInnkjopsprisEksMva,
          enhetsSalgsprisEksMva,
          notat: parsed.data.notat,
          createdById: session.user.id
        }
      });

      await tx.inventoryMaterial.update({
        where: { id: material.id },
        data: {
          lagerBeholdning: Number((material.lagerBeholdning - parsed.data.antall).toFixed(2))
        }
      });

      await tx.projectFinanceEntry.create({
        data: {
          projectId: parsed.data.projectId,
          type: "UTGIFT",
          dato: new Date(`${parsed.data.dato}T00:00:00`),
          beskrivelse: `Materialforbruk lager: ${material.navn} (${parsed.data.antall} ${material.enhet})`,
          belopEksMva: kostEksMva,
          createdById: session.user.id
        }
      });

      return consumption;
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_MATERIAL_CONSUMPTION_CREATED",
      entityType: "PROJECT_MATERIAL_CONSUMPTION",
      entityId: created.id,
      metadata: {
        projectId: created.projectId,
        materialId: created.materialId,
        antall: created.antall,
        enhet: created.enhet,
        enhetsInnkjopsprisEksMva,
        enhetsSalgsprisEksMva
      }
    });

    redirect(`/prosjekter/${parsed.data.projectId}?success=material-consumption-created#materialer`);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}?error=Klarte%20ikke%20a%20registrere%20materialforbruk#materialer`);
  }
}

export async function generateLowStockPurchaseOrdersAction(): Promise<void> {
  const session = await requireAuthPage();

  try {
    const lookbackDays = 90;
    const reorderCoverageDays = 45;
    const materialsWithThreshold = await db.inventoryMaterial.findMany({
      where: {
        lavLagerGrense: { gt: 0 }
      },
      orderBy: [{ supplierId: "asc" }, { navn: "asc" }]
    });
    const lowStockMaterials = materialsWithThreshold.filter((material) => material.lagerBeholdning <= material.lavLagerGrense);

    if (lowStockMaterials.length === 0) {
      redirect("/materialer?warning=Ingen%20lavlagerlinjer%20a%20generere");
    }

    const consumptionWindowStart = new Date();
    consumptionWindowStart.setDate(consumptionWindowStart.getDate() - lookbackDays);
    const consumptionSums = await db.projectMaterialConsumption.groupBy({
      by: ["materialId"],
      where: {
        materialId: {
          in: lowStockMaterials.map((material) => material.id)
        },
        dato: {
          gte: consumptionWindowStart
        }
      },
      _sum: {
        antall: true
      }
    });
    const consumptionByMaterialId = new Map<string, number>();
    for (const row of consumptionSums) {
      consumptionByMaterialId.set(row.materialId, Number(row._sum.antall ?? 0));
    }

    const bySupplier = new Map<string, typeof lowStockMaterials>();
    for (const material of lowStockMaterials) {
      const list = bySupplier.get(material.supplierId) ?? [];
      list.push(material);
      bySupplier.set(material.supplierId, list);
    }

    let orderCount = 0;
    for (const [supplierId, materials] of bySupplier.entries()) {
      const createdOrder = await db.purchaseOrder.create({
        data: {
          supplierId,
          status: PurchaseOrderStatus.UTKAST,
          notat: `Auto-generert fra lavlager + forbruk siste ${lookbackDays} dager`,
          createdById: session.user.id,
          items: {
            create: materials.map((material) => {
              const consumedInLookback = consumptionByMaterialId.get(material.id) ?? 0;
              const estimatedCoverageNeed = (consumedInLookback / lookbackDays) * reorderCoverageDays;
              const thresholdBasedNeed = Math.max((material.lavLagerGrense * 2) - material.lagerBeholdning, 1);
              const historyBasedNeed = Math.max(estimatedCoverageNeed - material.lagerBeholdning, 0);
              const antall = Number(Math.max(thresholdBasedNeed, historyBasedNeed, 1).toFixed(2));
              return {
                materialId: material.id,
                antall,
                enhetsprisEksMva: material.innkjopsprisEksMva
              };
            })
          }
        },
        include: {
          items: true
        }
      });

      orderCount += 1;
      await logAudit({
        actorId: session.user.id,
        action: "PURCHASE_ORDER_GENERATED",
        entityType: "PURCHASE_ORDER",
        entityId: createdOrder.id,
        metadata: {
          supplierId,
          itemCount: createdOrder.items.length
        }
      });
    }

    redirect(`/materialer?success=po-generated&count=${orderCount}`);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20generere%20innkjopsordre");
  }
}

export async function markPurchaseOrderSentAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = markPurchaseOrderReceivedSchema.safeParse({
    purchaseOrderId: formData.get("purchaseOrderId")
  });

  if (!parsed.success) {
    redirect("/materialer?error=Ugyldig%20innkjopsordre");
  }

  try {
    const existing = await db.purchaseOrder.findUnique({
      where: { id: parsed.data.purchaseOrderId },
      select: {
        id: true,
        status: true
      }
    });

    if (!existing) {
      redirect("/materialer?error=Innkjopsordre%20ikke%20funnet");
    }

    if (existing.status === PurchaseOrderStatus.SENDT) {
      redirect("/materialer?warning=Innkjopsordre%20er%20allerede%20sendt");
    }

    if (existing.status === PurchaseOrderStatus.MOTTATT) {
      redirect("/materialer?error=Kan%20ikke%20sende%20mottatt%20ordre");
    }

    if (existing.status === PurchaseOrderStatus.ANNULLERT) {
      redirect("/materialer?error=Kan%20ikke%20sende%20annullert%20ordre");
    }

    await db.purchaseOrder.update({
      where: { id: existing.id },
      data: {
        status: PurchaseOrderStatus.SENDT
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PURCHASE_ORDER_SENT",
      entityType: "PURCHASE_ORDER",
      entityId: existing.id
    });

    redirect("/materialer?success=po-sent");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20oppdatere%20ordrestatus");
  }
}

export async function cancelPurchaseOrderAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = markPurchaseOrderReceivedSchema.safeParse({
    purchaseOrderId: formData.get("purchaseOrderId")
  });

  if (!parsed.success) {
    redirect("/materialer?error=Ugyldig%20innkjopsordre");
  }

  try {
    const existing = await db.purchaseOrder.findUnique({
      where: { id: parsed.data.purchaseOrderId },
      select: {
        id: true,
        status: true
      }
    });

    if (!existing) {
      redirect("/materialer?error=Innkjopsordre%20ikke%20funnet");
    }

    if (existing.status === PurchaseOrderStatus.ANNULLERT) {
      redirect("/materialer?warning=Innkjopsordre%20er%20allerede%20annullert");
    }

    if (existing.status === PurchaseOrderStatus.MOTTATT) {
      redirect("/materialer?error=Kan%20ikke%20annullere%20mottatt%20ordre");
    }

    await db.purchaseOrder.update({
      where: { id: existing.id },
      data: {
        status: PurchaseOrderStatus.ANNULLERT
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PURCHASE_ORDER_CANCELLED",
      entityType: "PURCHASE_ORDER",
      entityId: existing.id
    });

    redirect("/materialer?success=po-cancelled");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20oppdatere%20ordrestatus");
  }
}

export async function markPurchaseOrderReceivedAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = markPurchaseOrderReceivedSchema.safeParse({
    purchaseOrderId: formData.get("purchaseOrderId")
  });

  if (!parsed.success) {
    redirect("/materialer?error=Ugyldig%20innkjopsordre");
  }

  try {
    const existing = await db.purchaseOrder.findUnique({
      where: { id: parsed.data.purchaseOrderId },
      include: {
        items: true
      }
    });

    if (!existing) {
      redirect("/materialer?error=Innkjopsordre%20ikke%20funnet");
    }

    if (existing.status === PurchaseOrderStatus.MOTTATT) {
      redirect("/materialer?warning=Innkjopsordre%20er%20allerede%20mottatt");
    }

    if (existing.status === PurchaseOrderStatus.ANNULLERT) {
      redirect("/materialer?error=Kan%20ikke%20motta%20annullert%20ordre");
    }

    if (existing.status === PurchaseOrderStatus.UTKAST) {
      redirect("/materialer?error=Marker%20ordren%20som%20sendt%20forst");
    }

    await db.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          status: PurchaseOrderStatus.MOTTATT
        }
      });

      for (const item of existing.items) {
        await tx.inventoryMaterial.update({
          where: { id: item.materialId },
          data: {
            lagerBeholdning: {
              increment: item.antall
            }
          }
        });
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PURCHASE_ORDER_RECEIVED",
      entityType: "PURCHASE_ORDER",
      entityId: existing.id,
      metadata: {
        itemCount: existing.items.length
      }
    });

    redirect("/materialer?success=po-received");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/materialer?error=Klarte%20ikke%20a%20motta%20innkjopsordre");
  }
}


