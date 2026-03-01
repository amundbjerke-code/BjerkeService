import { ProjectBillingType, ProjectStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  projectId: z.string().cuid()
});

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const updateProjectSchema = z
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
    fastprisBelopEksMva: z.number().min(0).refine(Number.isFinite).nullable().optional().default(null),
    timeprisEksMva: z.number().min(0).refine(Number.isFinite).nullable().optional().default(null)
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

    if (data.sluttDato && dateStringSchema.safeParse(data.sluttDato).success) {
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

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

function toProjectMutationData(data: z.infer<typeof updateProjectSchema>) {
  return {
    customerId: data.customerId,
    navn: data.navn,
    beskrivelse: data.beskrivelse,
    adresse: data.adresse,
    status: data.status,
    billingType: data.billingType,
    fastprisBelopEksMva: data.billingType === ProjectBillingType.FASTPRIS ? data.fastprisBelopEksMva : null,
    timeprisEksMva: data.timeprisEksMva ?? null,
    startDato: new Date(`${data.startDato}T00:00:00`),
    sluttDato: data.sluttDato ? new Date(`${data.sluttDato}T00:00:00`) : null
  };
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig prosjekt-id" }, { status: 400 });
  }

  const project = await db.project.findUnique({
    where: { id: parsedParams.data.projectId },
    include: {
      customer: {
        select: {
          id: true,
          navn: true
        }
      }
    }
  });

  if (!project) {
    return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
  }

  return NextResponse.json({ data: project });
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig prosjekt-id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = updateProjectSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await db.project.update({
      where: { id: parsedParams.data.projectId },
      data: toProjectMutationData(parsedBody.data)
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_UPDATED",
      entityType: "PROJECT",
      entityId: updated.id,
      ipAddress: getRequestIp(request),
      metadata: { navn: updated.navn, status: updated.status, billingType: updated.billingType }
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Klarte ikke oppdatere prosjekt" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig prosjekt-id" }, { status: 400 });
  }

  try {
    const deleted = await db.project.delete({
      where: { id: parsedParams.data.projectId }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_DELETED",
      entityType: "PROJECT",
      entityId: deleted.id,
      ipAddress: getRequestIp(request),
      metadata: { navn: deleted.navn, status: deleted.status, billingType: deleted.billingType }
    });

    return NextResponse.json({ data: deleted });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Klarte ikke slette prosjekt" }, { status: 500 });
  }
}
