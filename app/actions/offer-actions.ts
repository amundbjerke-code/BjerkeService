"use server";

import { OfferHistoryAction, OfferStatus, OfferType, ProjectBillingType, ProjectStatus, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { calculateOfferTotals, DEFAULT_MVA_PERCENT } from "@/lib/offer-calculation";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

const offerIdSchema = z.object({
  offerId: z.string().cuid()
});

const offerInputSchema = z.object({
  customerId: z.string().cuid(),
  navn: z.string().trim().min(2).max(160),
  beskrivelse: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  offerType: z.nativeEnum(OfferType),
  timeEstimateHours: z.number().min(0).max(10000),
  hourlyRateEksMva: z.number().min(0).max(1000000),
  materialCostEksMva: z.number().min(0).max(100000000),
  markupPercent: z.number().min(0).max(500),
  riskBufferPercent: z.number().min(0).max(500),
  mvaPercent: z.number().min(0).max(100),
  specificationText: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
});

const statusUpdateSchema = z.object({
  offerId: z.string().cuid(),
  targetStatus: z.nativeEnum(OfferStatus)
});

type ParsedSpecificationItem = {
  tekst: string;
  belopEksMva: number | null;
  rekkefolge: number;
};

function parseOptionalNumber(value: FormDataEntryValue | null): number {
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

function parseNumberWithDefault(value: FormDataEntryValue | null, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }
  const parsed = parseOptionalNumber(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseSpecificationItems(rawText: string): { items: ParsedSpecificationItem[]; hasInvalidAmount: boolean } {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const items: ParsedSpecificationItem[] = [];
  let hasInvalidAmount = false;

  for (const [index, line] of lines.entries()) {
    const [rawTextPart, rawAmountPart] = line.split(";", 2);
    const text = rawTextPart?.trim() ?? "";
    if (!text) {
      continue;
    }

    let amount: number | null = null;
    if (typeof rawAmountPart === "string" && rawAmountPart.trim().length > 0) {
      const normalized = rawAmountPart.trim().replace(",", ".");
      const parsed = Number(normalized);
      if (!Number.isFinite(parsed) || parsed < 0) {
        hasInvalidAmount = true;
      } else {
        amount = Number(parsed.toFixed(2));
      }
    }

    items.push({
      tekst: text,
      belopEksMva: amount,
      rekkefolge: index + 1
    });
  }

  return { items, hasInvalidAmount };
}

function formDataToOfferInput(formData: FormData) {
  return offerInputSchema.safeParse({
    customerId: formData.get("customerId"),
    navn: formData.get("navn"),
    beskrivelse: formData.get("beskrivelse"),
    offerType: formData.get("offerType"),
    timeEstimateHours: parseOptionalNumber(formData.get("timeEstimateHours")),
    hourlyRateEksMva: parseOptionalNumber(formData.get("hourlyRateEksMva")),
    materialCostEksMva: parseNumberWithDefault(formData.get("materialCostEksMva"), 0),
    markupPercent: parseNumberWithDefault(formData.get("markupPercent"), 0),
    riskBufferPercent: parseNumberWithDefault(formData.get("riskBufferPercent"), 0),
    mvaPercent: parseNumberWithDefault(formData.get("mvaPercent"), DEFAULT_MVA_PERCENT),
    specificationText: formData.get("specificationText")
  });
}

function buildOfferSnapshot(offer: {
  id: string;
  customerId: string;
  projectId: string | null;
  navn: string;
  offerType: OfferType;
  status: OfferStatus;
  timeEstimateHours: number;
  hourlyRateEksMva: number;
  materialCostEksMva: number;
  markupPercent: number;
  riskBufferPercent: number;
  subtotalEksMva: number;
  markupAmountEksMva: number;
  riskAmountEksMva: number;
  totalEksMva: number;
  mvaPercent: number;
  totalInkMva: number;
  specificationItems: Array<{ tekst: string; belopEksMva: number | null; rekkefolge: number }>;
}) {
  return {
    customerId: offer.customerId,
    projectId: offer.projectId,
    navn: offer.navn,
    offerType: offer.offerType,
    status: offer.status,
    timeEstimateHours: offer.timeEstimateHours,
    hourlyRateEksMva: offer.hourlyRateEksMva,
    materialCostEksMva: offer.materialCostEksMva,
    markupPercent: offer.markupPercent,
    riskBufferPercent: offer.riskBufferPercent,
    subtotalEksMva: offer.subtotalEksMva,
    markupAmountEksMva: offer.markupAmountEksMva,
    riskAmountEksMva: offer.riskAmountEksMva,
    totalEksMva: offer.totalEksMva,
    mvaPercent: offer.mvaPercent,
    totalInkMva: offer.totalInkMva,
    specificationItems: offer.specificationItems
  } satisfies Prisma.JsonObject;
}

function getTransitionError(currentStatus: OfferStatus, targetStatus: OfferStatus): string | null {
  if (currentStatus === targetStatus) {
    return "Tilbudet er allerede i valgt status.";
  }

  if (currentStatus === OfferStatus.UTKAST && targetStatus === OfferStatus.SENDT) {
    return null;
  }
  if (currentStatus === OfferStatus.SENDT && (targetStatus === OfferStatus.GODKJENT || targetStatus === OfferStatus.AVVIST)) {
    return null;
  }

  return "Ugyldig statusovergang.";
}

function toProjectBillingType(offerType: OfferType): ProjectBillingType {
  return offerType === OfferType.FASTPRIS ? ProjectBillingType.FASTPRIS : ProjectBillingType.TIME;
}

export async function createOfferAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = formDataToOfferInput(formData);

  if (!parsed.success) {
    redirect("/tilbud?error=Ugyldige%20tilbudsdata");
  }

  const specification = parseSpecificationItems(parsed.data.specificationText);
  if (specification.hasInvalidAmount) {
    redirect("/tilbud?error=Ugyldig%20spesifikasjon.%20Bruk%20format%20Tekst;Belop");
  }

  try {
    const totals = calculateOfferTotals({
      timeEstimateHours: parsed.data.timeEstimateHours,
      hourlyRateEksMva: parsed.data.hourlyRateEksMva,
      materialCostEksMva: parsed.data.materialCostEksMva,
      markupPercent: parsed.data.markupPercent,
      riskBufferPercent: parsed.data.riskBufferPercent,
      mvaPercent: parsed.data.mvaPercent
    });

    const created = await db.$transaction(async (tx) => {
      const offer = await tx.offer.create({
        data: {
          customerId: parsed.data.customerId,
          navn: parsed.data.navn,
          beskrivelse: parsed.data.beskrivelse,
          offerType: parsed.data.offerType,
          status: OfferStatus.UTKAST,
          timeEstimateHours: parsed.data.timeEstimateHours,
          hourlyRateEksMva: parsed.data.hourlyRateEksMva,
          materialCostEksMva: parsed.data.materialCostEksMva,
          markupPercent: parsed.data.markupPercent,
          riskBufferPercent: parsed.data.riskBufferPercent,
          subtotalEksMva: totals.subtotalEksMva,
          markupAmountEksMva: totals.markupAmountEksMva,
          riskAmountEksMva: totals.riskAmountEksMva,
          totalEksMva: totals.totalEksMva,
          mvaPercent: parsed.data.mvaPercent,
          totalInkMva: totals.totalInkMva,
          createdById: session.user.id,
          updatedById: session.user.id,
          specificationItems: {
            create: specification.items
          }
        },
        include: {
          specificationItems: {
            orderBy: { rekkefolge: "asc" }
          }
        }
      });

      await tx.offerHistory.create({
        data: {
          offerId: offer.id,
          changedById: session.user.id,
          action: OfferHistoryAction.CREATED,
          toStatus: offer.status,
          snapshot: buildOfferSnapshot(offer)
        }
      });

      return offer;
    });

    await logAudit({
      actorId: session.user.id,
      action: "OFFER_CREATED",
      entityType: "OFFER",
      entityId: created.id,
      metadata: { navn: created.navn, status: created.status, offerType: created.offerType, totalEksMva: created.totalEksMva }
    });

    redirect(`/tilbud/${created.id}?success=created`);
  } catch (error) {
    console.error(error);
    redirect("/tilbud?error=Klarte%20ikke%20a%20opprette%20tilbud");
  }
}

export async function updateOfferAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsedId = offerIdSchema.safeParse({ offerId: formData.get("offerId") });
  const parsedInput = formDataToOfferInput(formData);

  if (!parsedId.success || !parsedInput.success) {
    redirect("/tilbud?error=Ugyldige%20tilbudsdata");
  }

  const specification = parseSpecificationItems(parsedInput.data.specificationText);
  if (specification.hasInvalidAmount) {
    redirect(`/tilbud/${parsedId.data.offerId}?error=Ugyldig%20spesifikasjon.%20Bruk%20format%20Tekst;Belop`);
  }

  try {
    const current = await db.offer.findUnique({
      where: { id: parsedId.data.offerId },
      select: { id: true, status: true }
    });

    if (!current) {
      redirect("/tilbud?error=Tilbud%20ikke%20funnet");
    }

    if (current.status !== OfferStatus.UTKAST) {
      redirect(`/tilbud/${current.id}?error=Kun%20utkast%20kan%20redigeres`);
    }

    const totals = calculateOfferTotals({
      timeEstimateHours: parsedInput.data.timeEstimateHours,
      hourlyRateEksMva: parsedInput.data.hourlyRateEksMva,
      materialCostEksMva: parsedInput.data.materialCostEksMva,
      markupPercent: parsedInput.data.markupPercent,
      riskBufferPercent: parsedInput.data.riskBufferPercent,
      mvaPercent: parsedInput.data.mvaPercent
    });

    const updated = await db.$transaction(async (tx) => {
      const offer = await tx.offer.update({
        where: { id: current.id },
        data: {
          customerId: parsedInput.data.customerId,
          navn: parsedInput.data.navn,
          beskrivelse: parsedInput.data.beskrivelse,
          offerType: parsedInput.data.offerType,
          timeEstimateHours: parsedInput.data.timeEstimateHours,
          hourlyRateEksMva: parsedInput.data.hourlyRateEksMva,
          materialCostEksMva: parsedInput.data.materialCostEksMva,
          markupPercent: parsedInput.data.markupPercent,
          riskBufferPercent: parsedInput.data.riskBufferPercent,
          subtotalEksMva: totals.subtotalEksMva,
          markupAmountEksMva: totals.markupAmountEksMva,
          riskAmountEksMva: totals.riskAmountEksMva,
          totalEksMva: totals.totalEksMva,
          mvaPercent: parsedInput.data.mvaPercent,
          totalInkMva: totals.totalInkMva,
          updatedById: session.user.id,
          specificationItems: {
            deleteMany: {},
            create: specification.items
          }
        },
        include: {
          specificationItems: {
            orderBy: { rekkefolge: "asc" }
          }
        }
      });

      await tx.offerHistory.create({
        data: {
          offerId: offer.id,
          changedById: session.user.id,
          action: OfferHistoryAction.UPDATED,
          fromStatus: current.status,
          toStatus: offer.status,
          snapshot: buildOfferSnapshot(offer)
        }
      });

      return offer;
    });

    await logAudit({
      actorId: session.user.id,
      action: "OFFER_UPDATED",
      entityType: "OFFER",
      entityId: updated.id,
      metadata: { navn: updated.navn, status: updated.status, offerType: updated.offerType, totalEksMva: updated.totalEksMva }
    });

    redirect(`/tilbud/${updated.id}?success=updated`);
  } catch (error) {
    console.error(error);
    redirect(`/tilbud/${parsedId.data.offerId}?error=Klarte%20ikke%20a%20lagre%20tilbud`);
  }
}

export async function updateOfferStatusAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = statusUpdateSchema.safeParse({
    offerId: formData.get("offerId"),
    targetStatus: formData.get("targetStatus")
  });

  if (!parsed.success) {
    redirect("/tilbud?error=Ugyldig%20statusoppdatering");
  }

  try {
    const existing = await db.offer.findUnique({
      where: { id: parsed.data.offerId },
      include: {
        customer: {
          select: {
            navn: true
          }
        },
        specificationItems: {
          orderBy: { rekkefolge: "asc" },
          select: {
            tekst: true,
            belopEksMva: true,
            rekkefolge: true
          }
        }
      }
    });

    if (!existing) {
      redirect("/tilbud?error=Tilbud%20ikke%20funnet");
    }

    const transitionError = getTransitionError(existing.status, parsed.data.targetStatus);
    if (transitionError) {
      redirect(`/tilbud/${existing.id}?error=${encodeURIComponent(transitionError)}`);
    }

    const now = new Date();
    const statusData: Prisma.OfferUpdateInput = {
      status: parsed.data.targetStatus,
      updatedBy: {
        connect: { id: session.user.id }
      }
    };

    if (parsed.data.targetStatus === OfferStatus.SENDT) {
      statusData.sentAt = now;
    }

    if (parsed.data.targetStatus === OfferStatus.GODKJENT) {
      statusData.approvedAt = now;
    }

    if (parsed.data.targetStatus === OfferStatus.AVVIST) {
      statusData.rejectedAt = now;
    }

    const result = await db.$transaction(async (tx) => {
      let projectId: string | null = existing.projectId;

      if (parsed.data.targetStatus === OfferStatus.GODKJENT && !existing.projectId) {
        const createdProject = await tx.project.create({
          data: {
            customerId: existing.customerId,
            navn: existing.navn,
            beskrivelse: existing.beskrivelse ?? `Automatisk opprettet fra tilbud for ${existing.customer.navn}.`,
            status: ProjectStatus.PLANLAGT,
            billingType: toProjectBillingType(existing.offerType),
            fastprisBelopEksMva: existing.offerType === OfferType.FASTPRIS ? existing.totalEksMva : null,
            timeprisEksMva: existing.hourlyRateEksMva,
            startDato: now,
            sluttDato: null
          }
        });

        projectId = createdProject.id;
        statusData.project = { connect: { id: createdProject.id } };
        statusData.convertedToProjectAt = now;
      }

      const updated = await tx.offer.update({
        where: { id: existing.id },
        data: statusData,
        include: {
          specificationItems: {
            orderBy: { rekkefolge: "asc" }
          }
        }
      });

      await tx.offerHistory.create({
        data: {
          offerId: updated.id,
          changedById: session.user.id,
          action: OfferHistoryAction.STATUS_CHANGED,
          fromStatus: existing.status,
          toStatus: updated.status,
          snapshot: buildOfferSnapshot(updated)
        }
      });

      if (parsed.data.targetStatus === OfferStatus.GODKJENT && projectId && !existing.projectId) {
        await tx.offerHistory.create({
          data: {
            offerId: updated.id,
            changedById: session.user.id,
            action: OfferHistoryAction.CONVERTED_TO_PROJECT,
            fromStatus: existing.status,
            toStatus: updated.status,
            note: `Prosjekt ${projectId} ble opprettet automatisk.`,
            snapshot: buildOfferSnapshot(updated)
          }
        });
      }

      return { updated, projectId, projectCreated: parsed.data.targetStatus === OfferStatus.GODKJENT && !existing.projectId };
    });

    await logAudit({
      actorId: session.user.id,
      action: "OFFER_STATUS_UPDATED",
      entityType: "OFFER",
      entityId: result.updated.id,
      metadata: {
        fromStatus: existing.status,
        toStatus: result.updated.status,
        projectId: result.projectId,
        projectCreated: result.projectCreated
      }
    });

    if (result.updated.status === OfferStatus.SENDT) {
      redirect(`/tilbud/${result.updated.id}?success=sent`);
    }
    if (result.updated.status === OfferStatus.GODKJENT) {
      redirect(`/tilbud/${result.updated.id}?success=approved`);
    }
    if (result.updated.status === OfferStatus.AVVIST) {
      redirect(`/tilbud/${result.updated.id}?success=rejected`);
    }

    redirect(`/tilbud/${result.updated.id}?success=updated`);
  } catch (error) {
    console.error(error);
    redirect(`/tilbud/${parsed.data.offerId}?error=Klarte%20ikke%20a%20oppdatere%20status`);
  }
}
