"use server";

import { CustomerStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

const customerIdSchema = z.object({
  customerId: z.string().cuid()
});

const customerInputSchema = z.object({
  navn: z.string().trim().min(2).max(120),
  orgnr: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  epost: z.string().trim().email().max(200),
  telefon: z.string().trim().min(5).max(40),
  adresse: z.string().trim().min(2).max(200),
  postnr: z.string().trim().min(2).max(12),
  poststed: z.string().trim().min(2).max(120),
  notater: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

function formDataToCustomerInput(formData: FormData) {
  return customerInputSchema.safeParse({
    navn: formData.get("navn"),
    orgnr: formData.get("orgnr"),
    epost: formData.get("epost"),
    telefon: formData.get("telefon"),
    adresse: formData.get("adresse"),
    postnr: formData.get("postnr"),
    poststed: formData.get("poststed"),
    notater: formData.get("notater")
  });
}

export async function createCustomerAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = formDataToCustomerInput(formData);

  if (!parsed.success) {
    redirect("/kunder?error=Ugyldige%20kundeopplysninger");
  }

  try {
    const created = await db.customer.create({
      data: parsed.data
    });

    await logAudit({
      actorId: session.user.id,
      action: "CUSTOMER_CREATED",
      entityType: "CUSTOMER",
      entityId: created.id,
      metadata: { navn: created.navn, status: created.status }
    });

    redirect(`/kunder/${created.id}?success=created`);
  } catch (error) {
    console.error(error);
    redirect("/kunder?error=Klarte%20ikke%20a%20opprette%20kunde");
  }
}

export async function updateCustomerAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsedId = customerIdSchema.safeParse({
    customerId: formData.get("customerId")
  });
  const parsedInput = formDataToCustomerInput(formData);

  if (!parsedId.success || !parsedInput.success) {
    redirect("/kunder?error=Ugyldige%20kundeopplysninger");
  }

  try {
    const updated = await db.customer.update({
      where: { id: parsedId.data.customerId },
      data: parsedInput.data
    });

    await logAudit({
      actorId: session.user.id,
      action: "CUSTOMER_UPDATED",
      entityType: "CUSTOMER",
      entityId: updated.id,
      metadata: { navn: updated.navn, status: updated.status }
    });

    redirect(`/kunder/${updated.id}?success=updated`);
  } catch (error) {
    console.error(error);
    redirect(`/kunder/${parsedId.data.customerId}?error=Klarte%20ikke%20a%20lagre%20kunde`);
  }
}

async function updateCustomerStatusAction(formData: FormData, status: CustomerStatus, action: string, success: string) {
  const session = await requireAuthPage();
  const parsedId = customerIdSchema.safeParse({
    customerId: formData.get("customerId")
  });

  if (!parsedId.success) {
    redirect("/kunder?error=Ugyldig%20kunde");
  }

  try {
    const updated = await db.customer.update({
      where: { id: parsedId.data.customerId },
      data: { status }
    });

    await logAudit({
      actorId: session.user.id,
      action,
      entityType: "CUSTOMER",
      entityId: updated.id,
      metadata: { navn: updated.navn, status: updated.status }
    });

    redirect(`/kunder/${updated.id}?success=${success}`);
  } catch (error) {
    console.error(error);
    redirect(`/kunder/${parsedId.data.customerId}?error=Klarte%20ikke%20a%20oppdatere%20status`);
  }
}

export async function deactivateCustomerAction(formData: FormData): Promise<void> {
  await updateCustomerStatusAction(formData, CustomerStatus.INACTIVE, "CUSTOMER_DEACTIVATED", "deactivated");
}

export async function activateCustomerAction(formData: FormData): Promise<void> {
  await updateCustomerStatusAction(formData, CustomerStatus.ACTIVE, "CUSTOMER_ACTIVATED", "activated");
}
