"use server";

import { AvvikAlvorlighetsgrad, AvvikStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

const createAvvikSchema = z.object({
  projectId: z.string().cuid(),
  tittel: z.string().trim().min(2).max(200),
  beskrivelse: z.string().trim().min(2).max(4000),
  alvorlighetsgrad: z.nativeEnum(AvvikAlvorlighetsgrad)
});

const updateAvvikSchema = z.object({
  avvikId: z.string().cuid(),
  projectId: z.string().cuid(),
  tittel: z.string().trim().min(2).max(200),
  beskrivelse: z.string().trim().min(2).max(4000),
  alvorlighetsgrad: z.nativeEnum(AvvikAlvorlighetsgrad),
  status: z.nativeEnum(AvvikStatus),
  tiltak: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const deleteAvvikSchema = z.object({
  avvikId: z.string().cuid(),
  projectId: z.string().cuid()
});

export async function createAvvikAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = createAvvikSchema.safeParse({
    projectId: formData.get("projectId"),
    tittel: formData.get("tittel"),
    beskrivelse: formData.get("beskrivelse"),
    alvorlighetsgrad: formData.get("alvorlighetsgrad")
  });

  if (!parsed.success) {
    redirect(`/prosjekter/${formData.get("projectId")}?error=Ugyldige%20avviksopplysninger#avvik`);
  }

  try {
    const created = await db.avvik.create({
      data: {
        projectId: parsed.data.projectId,
        tittel: parsed.data.tittel,
        beskrivelse: parsed.data.beskrivelse,
        alvorlighetsgrad: parsed.data.alvorlighetsgrad,
        registrertAvId: session.user.id
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "AVVIK_CREATED",
      entityType: "AVVIK",
      entityId: created.id,
      metadata: {
        projectId: created.projectId,
        tittel: created.tittel,
        alvorlighetsgrad: created.alvorlighetsgrad
      }
    });

    redirect(`/prosjekter/${parsed.data.projectId}?success=avvik-created#avvik`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}?error=Klarte%20ikke%20a%20opprette%20avvik#avvik`);
  }
}

export async function updateAvvikAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = updateAvvikSchema.safeParse({
    avvikId: formData.get("avvikId"),
    projectId: formData.get("projectId"),
    tittel: formData.get("tittel"),
    beskrivelse: formData.get("beskrivelse"),
    alvorlighetsgrad: formData.get("alvorlighetsgrad"),
    status: formData.get("status"),
    tiltak: formData.get("tiltak")
  });

  if (!parsed.success) {
    redirect(`/prosjekter/${formData.get("projectId")}?error=Ugyldige%20avviksopplysninger#avvik`);
  }

  try {
    const lukketData =
      parsed.data.status === AvvikStatus.LUKKET
        ? { lukketAvId: session.user.id, lukketDato: new Date() }
        : { lukketAvId: null, lukketDato: null };

    const updated = await db.avvik.update({
      where: { id: parsed.data.avvikId },
      data: {
        tittel: parsed.data.tittel,
        beskrivelse: parsed.data.beskrivelse,
        alvorlighetsgrad: parsed.data.alvorlighetsgrad,
        status: parsed.data.status,
        tiltak: parsed.data.tiltak,
        ...lukketData
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "AVVIK_UPDATED",
      entityType: "AVVIK",
      entityId: updated.id,
      metadata: {
        projectId: updated.projectId,
        tittel: updated.tittel,
        status: updated.status,
        alvorlighetsgrad: updated.alvorlighetsgrad
      }
    });

    redirect(`/prosjekter/${parsed.data.projectId}/avvik/${parsed.data.avvikId}?success=updated`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}/avvik/${parsed.data.avvikId}?error=Klarte%20ikke%20a%20oppdatere%20avvik`);
  }
}

export async function deleteAvvikAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = deleteAvvikSchema.safeParse({
    avvikId: formData.get("avvikId"),
    projectId: formData.get("projectId")
  });

  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldig%20avvik");
  }

  try {
    const deleted = await db.avvik.delete({
      where: { id: parsed.data.avvikId }
    });

    await logAudit({
      actorId: session.user.id,
      action: "AVVIK_DELETED",
      entityType: "AVVIK",
      entityId: deleted.id,
      metadata: { projectId: deleted.projectId, tittel: deleted.tittel }
    });

    redirect(`/prosjekter/${parsed.data.projectId}?success=avvik-deleted#avvik`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}?error=Klarte%20ikke%20a%20slette%20avvik#avvik`);
  }
}
