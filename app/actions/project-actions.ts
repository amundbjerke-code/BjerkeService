"use server";

import { ProjectBillingType, ProjectStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

const projectIdSchema = z.object({
  projectId: z.string().cuid()
});

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const projectInputSchema = z
  .object({
    customerId: z.string().cuid(),
    navn: z.string().trim().min(2).max(150),
    beskrivelse: z
      .string()
      .trim()
      .max(4000)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    adresse: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    status: z.nativeEnum(ProjectStatus),
    billingType: z.nativeEnum(ProjectBillingType),
    startDato: dateStringSchema,
    sluttDato: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    fastprisBelopEksMva: z.number().min(0).refine(Number.isFinite).nullable(),
    timeprisEksMva: z.number().min(0).refine(Number.isFinite).nullable()
  })
  .superRefine((data, context) => {
    if (data.billingType === ProjectBillingType.FASTPRIS && (!data.fastprisBelopEksMva || data.fastprisBelopEksMva <= 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fastprisBelopEksMva"],
        message: "Fastpris ma settes nar billing type er FASTPRIS."
      });
    }

    if (data.sluttDato && !dateStringSchema.safeParse(data.sluttDato).success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sluttDato"],
        message: "Ugyldig sluttdato."
      });
    }

    if (data.sluttDato) {
      const start = new Date(`${data.startDato}T00:00:00`);
      const slutt = new Date(`${data.sluttDato}T00:00:00`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(slutt.getTime()) && slutt < start) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sluttDato"],
          message: "Sluttdato kan ikke vaere for startdato."
        });
      }
    }
  });

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

function formDataToProjectInput(formData: FormData) {
  return projectInputSchema.safeParse({
    customerId: formData.get("customerId"),
    navn: formData.get("navn"),
    beskrivelse: formData.get("beskrivelse"),
    adresse: formData.get("adresse"),
    status: formData.get("status"),
    billingType: formData.get("billingType"),
    startDato: formData.get("startDato"),
    sluttDato: formData.get("sluttDato"),
    fastprisBelopEksMva: parseOptionalNumber(formData.get("fastprisBelopEksMva")),
    timeprisEksMva: parseOptionalNumber(formData.get("timeprisEksMva"))
  });
}

function toProjectMutationData(data: z.infer<typeof projectInputSchema>) {
  return {
    customerId: data.customerId,
    navn: data.navn,
    beskrivelse: data.beskrivelse,
    adresse: data.adresse,
    status: data.status,
    billingType: data.billingType,
    fastprisBelopEksMva: data.billingType === ProjectBillingType.FASTPRIS ? data.fastprisBelopEksMva : null,
    timeprisEksMva: data.timeprisEksMva,
    startDato: new Date(`${data.startDato}T00:00:00`),
    sluttDato: data.sluttDato ? new Date(`${data.sluttDato}T00:00:00`) : null
  };
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = formDataToProjectInput(formData);

  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldige%20prosjektopplysninger");
  }

  try {
    const created = await db.project.create({
      data: toProjectMutationData(parsed.data)
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_CREATED",
      entityType: "PROJECT",
      entityId: created.id,
      metadata: { navn: created.navn, status: created.status, billingType: created.billingType }
    });

    redirect(`/prosjekter/${created.id}?success=created`);
  } catch (error) {
    console.error(error);
    redirect("/prosjekter?error=Klarte%20ikke%20a%20opprette%20prosjekt");
  }
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsedId = projectIdSchema.safeParse({
    projectId: formData.get("projectId")
  });
  const parsedInput = formDataToProjectInput(formData);

  if (!parsedId.success || !parsedInput.success) {
    redirect("/prosjekter?error=Ugyldige%20prosjektopplysninger");
  }

  try {
    const updated = await db.project.update({
      where: { id: parsedId.data.projectId },
      data: toProjectMutationData(parsedInput.data)
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_UPDATED",
      entityType: "PROJECT",
      entityId: updated.id,
      metadata: { navn: updated.navn, status: updated.status, billingType: updated.billingType }
    });

    redirect(`/prosjekter/${updated.id}?success=updated`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsedId.data.projectId}?error=Klarte%20ikke%20a%20lagre%20prosjekt`);
  }
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsedId = projectIdSchema.safeParse({
    projectId: formData.get("projectId")
  });

  if (!parsedId.success) {
    redirect("/prosjekter?error=Ugyldig%20prosjekt");
  }

  try {
    const deleted = await db.project.delete({
      where: { id: parsedId.data.projectId }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_DELETED",
      entityType: "PROJECT",
      entityId: deleted.id,
      metadata: { navn: deleted.navn, status: deleted.status, billingType: deleted.billingType }
    });

    redirect("/prosjekter?success=deleted");
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsedId.data.projectId}?error=Klarte%20ikke%20a%20slette%20prosjekt`);
  }
}
