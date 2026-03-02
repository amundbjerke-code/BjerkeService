"use server";

import { MaterialStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return Number.NaN;
  }
  return Number(numeric.toFixed(2));
}

function parseRequiredNumber(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") {
    return Number.NaN;
  }
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return Number.NaN;
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return Number.NaN;
  }
  return numeric;
}

const createMaterialSchema = z.object({
  projectId: z.string().cuid(),
  navn: z.string().trim().min(1).max(200),
  antall: z.number().gt(0).max(99999),
  enhet: z.string().trim().min(1).max(50),
  estimertPris: z.number().min(0).refine(Number.isFinite).nullable(),
  notat: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const updateMaterialStatusSchema = z.object({
  materialId: z.string().cuid(),
  projectId: z.string().cuid(),
  status: z.nativeEnum(MaterialStatus)
});

const deleteMaterialSchema = z.object({
  materialId: z.string().cuid(),
  projectId: z.string().cuid()
});

export async function createMaterialAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = createMaterialSchema.safeParse({
    projectId: formData.get("projectId"),
    navn: formData.get("navn"),
    antall: parseRequiredNumber(formData.get("antall")),
    enhet: formData.get("enhet"),
    estimertPris: parseOptionalNumber(formData.get("estimertPris")),
    notat: formData.get("notat")
  });

  if (!parsed.success) {
    redirect(`/prosjekter/${formData.get("projectId")}?error=Ugyldige%20materialopplysninger#materialer`);
  }

  try {
    const created = await db.materialItem.create({
      data: {
        projectId: parsed.data.projectId,
        navn: parsed.data.navn,
        antall: parsed.data.antall,
        enhet: parsed.data.enhet,
        estimertPris: parsed.data.estimertPris,
        notat: parsed.data.notat,
        lagtTilAvId: session.user.id
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "MATERIAL_CREATED",
      entityType: "MATERIAL_ITEM",
      entityId: created.id,
      metadata: { projectId: created.projectId, navn: created.navn, antall: created.antall, enhet: created.enhet }
    });

    redirect(`/prosjekter/${parsed.data.projectId}?success=material-created#materialer`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}?error=Klarte%20ikke%20a%20legge%20til%20material#materialer`);
  }
}

export async function updateMaterialStatusAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = updateMaterialStatusSchema.safeParse({
    materialId: formData.get("materialId"),
    projectId: formData.get("projectId"),
    status: formData.get("status")
  });

  if (!parsed.success) {
    redirect(`/prosjekter/${formData.get("projectId")}?error=Ugyldig%20statusendring#materialer`);
  }

  try {
    const existing = await db.materialItem.findUnique({
      where: { id: parsed.data.materialId },
      select: { navn: true, status: true }
    });

    const updated = await db.materialItem.update({
      where: { id: parsed.data.materialId },
      data: { status: parsed.data.status }
    });

    await logAudit({
      actorId: session.user.id,
      action: "MATERIAL_STATUS_UPDATED",
      entityType: "MATERIAL_ITEM",
      entityId: updated.id,
      metadata: {
        projectId: updated.projectId,
        navn: updated.navn,
        oldStatus: existing?.status,
        newStatus: updated.status
      }
    });

    redirect(`/prosjekter/${parsed.data.projectId}?success=material-updated#materialer`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}?error=Klarte%20ikke%20a%20oppdatere%20material#materialer`);
  }
}

export async function deleteMaterialAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = deleteMaterialSchema.safeParse({
    materialId: formData.get("materialId"),
    projectId: formData.get("projectId")
  });

  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldig%20material");
  }

  try {
    const deleted = await db.materialItem.delete({
      where: { id: parsed.data.materialId }
    });

    await logAudit({
      actorId: session.user.id,
      action: "MATERIAL_DELETED",
      entityType: "MATERIAL_ITEM",
      entityId: deleted.id,
      metadata: { projectId: deleted.projectId, navn: deleted.navn }
    });

    redirect(`/prosjekter/${parsed.data.projectId}?success=material-deleted#materialer`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}?error=Klarte%20ikke%20a%20slette%20material#materialer`);
  }
}
