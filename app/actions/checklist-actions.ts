"use server";

import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthPage, requireRolePage } from "@/lib/rbac";

const cuidSchema = z.string().cuid();

const templateInputSchema = z.object({
  navn: z.string().trim().min(2).max(150),
  kategori: z.string().trim().min(2).max(120),
  punkter: z.string().trim().min(2).max(10000)
});

const createFromTemplateSchema = z.object({
  projectId: cuidSchema,
  templateId: cuidSchema,
  navn: z
    .string()
    .trim()
    .max(150)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const createScratchSchema = z.object({
  projectId: cuidSchema,
  navn: z.string().trim().min(2).max(150),
  punkter: z.string().trim().min(2).max(10000)
});

function splitItems(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function createChecklistTemplateAction(formData: FormData): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);

  const parsed = templateInputSchema.safeParse({
    navn: formData.get("navn"),
    kategori: formData.get("kategori"),
    punkter: formData.get("punkter")
  });

  if (!parsed.success) {
    redirect("/sjekklister/maler?error=Ugyldige%20felter");
  }

  const items = splitItems(parsed.data.punkter);
  if (items.length === 0) {
    redirect("/sjekklister/maler?error=Legg%20inn%20minst%20ett%20punkt");
  }

  const template = await db.checklistTemplate.create({
    data: {
      navn: parsed.data.navn,
      kategori: parsed.data.kategori,
      items: {
        create: items.map((tekst, index) => ({
          tekst,
          rekkefolge: index + 1
        }))
      }
    }
  });

  await logAudit({
    actorId: session.user.id,
    action: "CHECKLIST_TEMPLATE_CREATED",
    entityType: "CHECKLIST_TEMPLATE",
    entityId: template.id,
    metadata: { navn: template.navn, kategori: template.kategori, itemCount: items.length }
  });

  redirect("/sjekklister/maler?success=created");
}

export async function updateChecklistTemplateAction(formData: FormData): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);

  const templateId = cuidSchema.safeParse(formData.get("templateId"));
  const parsed = templateInputSchema.safeParse({
    navn: formData.get("navn"),
    kategori: formData.get("kategori"),
    punkter: formData.get("punkter")
  });

  if (!templateId.success || !parsed.success) {
    redirect("/sjekklister/maler?error=Ugyldige%20felter");
  }

  const items = splitItems(parsed.data.punkter);
  if (items.length === 0) {
    redirect("/sjekklister/maler?error=Legg%20inn%20minst%20ett%20punkt");
  }

  await db.$transaction(async (tx) => {
    await tx.checklistTemplate.update({
      where: { id: templateId.data },
      data: {
        navn: parsed.data.navn,
        kategori: parsed.data.kategori
      }
    });

    await tx.checklistTemplateItem.deleteMany({
      where: { templateId: templateId.data }
    });

    await tx.checklistTemplateItem.createMany({
      data: items.map((tekst, index) => ({
        templateId: templateId.data,
        tekst,
        rekkefolge: index + 1
      }))
    });
  });

  await logAudit({
    actorId: session.user.id,
    action: "CHECKLIST_TEMPLATE_UPDATED",
    entityType: "CHECKLIST_TEMPLATE",
    entityId: templateId.data,
    metadata: { navn: parsed.data.navn, kategori: parsed.data.kategori, itemCount: items.length }
  });

  redirect("/sjekklister/maler?success=updated");
}

export async function deleteChecklistTemplateAction(formData: FormData): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);
  const templateId = cuidSchema.safeParse(formData.get("templateId"));
  if (!templateId.success) {
    redirect("/sjekklister/maler?error=Ugyldig%20mal");
  }

  const deleted = await db.checklistTemplate.delete({
    where: { id: templateId.data }
  });

  await logAudit({
    actorId: session.user.id,
    action: "CHECKLIST_TEMPLATE_DELETED",
    entityType: "CHECKLIST_TEMPLATE",
    entityId: deleted.id,
    metadata: { navn: deleted.navn, kategori: deleted.kategori }
  });

  redirect("/sjekklister/maler?success=deleted");
}

export async function createProjectChecklistFromTemplateAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = createFromTemplateSchema.safeParse({
    projectId: formData.get("projectId"),
    templateId: formData.get("templateId"),
    navn: formData.get("navn")
  });

  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldig%20sjekklisteoppretting");
  }

  const template = await db.checklistTemplate.findUnique({
    where: { id: parsed.data.templateId },
    include: {
      items: {
        orderBy: { rekkefolge: "asc" }
      }
    }
  });

  if (!template || template.items.length === 0) {
    redirect(`/prosjekter/${parsed.data.projectId}?error=Mal%20ikke%20funnet`);
  }

  const checklist = await db.projectChecklist.create({
    data: {
      projectId: parsed.data.projectId,
      createdById: session.user.id,
      navn: parsed.data.navn ?? template.navn,
      items: {
        create: template.items.map((item) => ({
          tekst: item.tekst,
          rekkefolge: item.rekkefolge
        }))
      }
    }
  });

  await logAudit({
    actorId: session.user.id,
    action: "PROJECT_CHECKLIST_CREATED_FROM_TEMPLATE",
    entityType: "PROJECT_CHECKLIST",
    entityId: checklist.id,
    metadata: { projectId: parsed.data.projectId, templateId: template.id, checklistNavn: checklist.navn }
  });

  redirect(`/prosjekter/${parsed.data.projectId}/sjekklister/${checklist.id}?success=created`);
}

export async function createProjectChecklistFromScratchAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = createScratchSchema.safeParse({
    projectId: formData.get("projectId"),
    navn: formData.get("navn"),
    punkter: formData.get("punkter")
  });

  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldig%20sjekklisteoppretting");
  }

  const items = splitItems(parsed.data.punkter);
  if (items.length === 0) {
    redirect(`/prosjekter/${parsed.data.projectId}?error=Legg%20inn%20minst%20ett%20punkt`);
  }

  const checklist = await db.projectChecklist.create({
    data: {
      projectId: parsed.data.projectId,
      navn: parsed.data.navn,
      createdById: session.user.id,
      items: {
        create: items.map((tekst, index) => ({
          tekst,
          rekkefolge: index + 1
        }))
      }
    }
  });

  await logAudit({
    actorId: session.user.id,
    action: "PROJECT_CHECKLIST_CREATED_FROM_SCRATCH",
    entityType: "PROJECT_CHECKLIST",
    entityId: checklist.id,
    metadata: { projectId: parsed.data.projectId, checklistNavn: checklist.navn, itemCount: items.length }
  });

  redirect(`/prosjekter/${parsed.data.projectId}/sjekklister/${checklist.id}?success=created`);
}
