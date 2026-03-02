"use server";

import { ProjectFinanceEntryType } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const createProjectFinanceEntrySchema = z.object({
  projectId: z.string().cuid(),
  type: z.nativeEnum(ProjectFinanceEntryType),
  dato: dateStringSchema,
  beskrivelse: z.string().trim().min(2).max(400),
  belopEksMva: z.number().gt(0).max(100000000)
});

const updateProjectFinanceEntrySchema = z.object({
  projectId: z.string().cuid(),
  financeEntryId: z.string().cuid(),
  type: z.nativeEnum(ProjectFinanceEntryType),
  dato: dateStringSchema,
  beskrivelse: z.string().trim().min(2).max(400),
  belopEksMva: z.number().gt(0).max(100000000)
});

const deleteProjectFinanceEntrySchema = z.object({
  projectId: z.string().cuid(),
  financeEntryId: z.string().cuid()
});

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

export async function createProjectFinanceEntryAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = createProjectFinanceEntrySchema.safeParse({
    projectId: formData.get("projectId"),
    type: formData.get("type"),
    dato: formData.get("dato"),
    beskrivelse: formData.get("beskrivelse"),
    belopEksMva: parseRequiredNumber(formData.get("belopEksMva"))
  });

  if (!parsed.success) {
    redirect(`/prosjekter/${formData.get("projectId")}?error=Ugyldig%20okonomipost#okonomi`);
  }

  try {
    const created = await db.projectFinanceEntry.create({
      data: {
        projectId: parsed.data.projectId,
        type: parsed.data.type,
        dato: new Date(`${parsed.data.dato}T00:00:00`),
        beskrivelse: parsed.data.beskrivelse,
        belopEksMva: parsed.data.belopEksMva,
        createdById: session.user.id
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_FINANCE_ENTRY_CREATED",
      entityType: "PROJECT_FINANCE_ENTRY",
      entityId: created.id,
      metadata: {
        projectId: created.projectId,
        type: created.type,
        belopEksMva: created.belopEksMva
      }
    });

    redirect(`/prosjekter/${parsed.data.projectId}?success=finance-created#okonomi`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}?error=Klarte%20ikke%20a%20lagre%20okonomipost#okonomi`);
  }
}

export async function updateProjectFinanceEntryAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = updateProjectFinanceEntrySchema.safeParse({
    projectId: formData.get("projectId"),
    financeEntryId: formData.get("financeEntryId"),
    type: formData.get("type"),
    dato: formData.get("dato"),
    beskrivelse: formData.get("beskrivelse"),
    belopEksMva: parseRequiredNumber(formData.get("belopEksMva"))
  });

  if (!parsed.success) {
    redirect(`/prosjekter/${formData.get("projectId")}?error=Ugyldig%20okonomipost#okonomi`);
  }

  try {
    const existing = await db.projectFinanceEntry.findUnique({
      where: { id: parsed.data.financeEntryId },
      select: {
        id: true,
        projectId: true,
        type: true,
        dato: true,
        beskrivelse: true,
        belopEksMva: true
      }
    });

    if (!existing || existing.projectId !== parsed.data.projectId) {
      redirect(`/prosjekter/${parsed.data.projectId}?error=Okonomipost%20ikke%20funnet#okonomi`);
    }

    const updated = await db.projectFinanceEntry.update({
      where: { id: existing.id },
      data: {
        type: parsed.data.type,
        dato: new Date(`${parsed.data.dato}T00:00:00`),
        beskrivelse: parsed.data.beskrivelse,
        belopEksMva: parsed.data.belopEksMva
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_FINANCE_ENTRY_UPDATED",
      entityType: "PROJECT_FINANCE_ENTRY",
      entityId: updated.id,
      metadata: {
        projectId: updated.projectId,
        before: {
          type: existing.type,
          dato: existing.dato.toISOString(),
          beskrivelse: existing.beskrivelse,
          belopEksMva: existing.belopEksMva
        },
        after: {
          type: updated.type,
          dato: updated.dato.toISOString(),
          beskrivelse: updated.beskrivelse,
          belopEksMva: updated.belopEksMva
        }
      }
    });

    redirect(`/prosjekter/${parsed.data.projectId}?success=finance-updated#okonomi`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}?error=Klarte%20ikke%20a%20oppdatere%20okonomipost#okonomi`);
  }
}

export async function deleteProjectFinanceEntryAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = deleteProjectFinanceEntrySchema.safeParse({
    projectId: formData.get("projectId"),
    financeEntryId: formData.get("financeEntryId")
  });

  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldig%20okonomipost");
  }

  try {
    const existing = await db.projectFinanceEntry.findUnique({
      where: { id: parsed.data.financeEntryId },
      select: {
        id: true,
        projectId: true,
        type: true,
        belopEksMva: true
      }
    });

    if (!existing || existing.projectId !== parsed.data.projectId) {
      redirect(`/prosjekter/${parsed.data.projectId}?error=Okonomipost%20ikke%20funnet#okonomi`);
    }

    const deleted = await db.projectFinanceEntry.delete({
      where: { id: existing.id }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_FINANCE_ENTRY_DELETED",
      entityType: "PROJECT_FINANCE_ENTRY",
      entityId: deleted.id,
      metadata: {
        projectId: deleted.projectId,
        type: deleted.type,
        belopEksMva: deleted.belopEksMva
      }
    });

    redirect(`/prosjekter/${parsed.data.projectId}?success=finance-deleted#okonomi`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}?error=Klarte%20ikke%20a%20slette%20okonomipost#okonomi`);
  }
}
