import { OfferHistoryAction, OfferStatus, ProjectBillingType, ProjectStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  offerId: z.string().cuid()
});

const payloadSchema = z.object({
  targetStatus: z.nativeEnum(OfferStatus)
});

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

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request, context: { params: Promise<{ offerId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig tilbud-id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = payloadSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  const existing = await db.offer.findUnique({
    where: { id: parsedParams.data.offerId },
    include: {
      customer: {
        select: {
          navn: true
        }
      }
    }
  });

  if (!existing) {
    return NextResponse.json({ error: "Tilbud ikke funnet" }, { status: 404 });
  }

  const transitionError = getTransitionError(existing.status, parsedBody.data.targetStatus);
  if (transitionError) {
    return NextResponse.json({ error: transitionError }, { status: 409 });
  }

  const now = new Date();

  try {
    const result = await db.$transaction(async (tx) => {
      let projectId: string | null = existing.projectId;

      if (parsedBody.data.targetStatus === OfferStatus.GODKJENT && !projectId) {
        const project = await tx.project.create({
          data: {
            customerId: existing.customerId,
            navn: existing.navn,
            beskrivelse: existing.beskrivelse ?? `Automatisk opprettet fra tilbud for ${existing.customer.navn}.`,
            status: ProjectStatus.PLANLAGT,
            billingType: existing.offerType === "FASTPRIS" ? ProjectBillingType.FASTPRIS : ProjectBillingType.TIME,
            fastprisBelopEksMva: existing.offerType === "FASTPRIS" ? existing.totalEksMva : null,
            timeprisEksMva: existing.hourlyRateEksMva,
            startDato: now,
            sluttDato: null
          }
        });
        projectId = project.id;
      }

      const updated = await tx.offer.update({
        where: { id: existing.id },
        data: {
          status: parsedBody.data.targetStatus,
          updatedById: session.user.id,
          sentAt: parsedBody.data.targetStatus === OfferStatus.SENDT ? now : existing.sentAt,
          approvedAt: parsedBody.data.targetStatus === OfferStatus.GODKJENT ? now : existing.approvedAt,
          rejectedAt: parsedBody.data.targetStatus === OfferStatus.AVVIST ? now : existing.rejectedAt,
          convertedToProjectAt:
            parsedBody.data.targetStatus === OfferStatus.GODKJENT && !existing.projectId && projectId ? now : existing.convertedToProjectAt,
          projectId
        },
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
          snapshot: {
            navn: updated.navn,
            status: updated.status,
            projectId: updated.projectId,
            totalEksMva: updated.totalEksMva,
            totalInkMva: updated.totalInkMva
          }
        }
      });

      if (parsedBody.data.targetStatus === OfferStatus.GODKJENT && !existing.projectId && projectId) {
        await tx.offerHistory.create({
          data: {
            offerId: updated.id,
            changedById: session.user.id,
            action: OfferHistoryAction.CONVERTED_TO_PROJECT,
            fromStatus: existing.status,
            toStatus: updated.status,
            note: `Prosjekt ${projectId} ble opprettet automatisk.`,
            snapshot: {
              projectId,
              customerId: updated.customerId,
              offerType: updated.offerType,
              totalEksMva: updated.totalEksMva
            }
          }
        });
      }

      return updated;
    });

    await logAudit({
      actorId: session.user.id,
      action: "OFFER_STATUS_UPDATED",
      entityType: "OFFER",
      entityId: result.id,
      ipAddress: getRequestIp(request),
      metadata: {
        fromStatus: existing.status,
        toStatus: result.status,
        projectId: result.projectId
      }
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Klarte ikke oppdatere tilbudsstatus" }, { status: 500 });
  }
}
