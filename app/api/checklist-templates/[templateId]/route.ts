import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi, requireRoleApi } from "@/lib/rbac";

const paramsSchema = z.object({
  templateId: z.string().cuid()
});

const updateTemplateSchema = z.object({
  navn: z.string().trim().min(2).max(150),
  kategori: z.string().trim().min(2).max(120),
  items: z.array(z.string().trim().min(1).max(500)).min(1).max(200)
});

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function GET(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig mal-id" }, { status: 400 });
  }

  const template = await db.checklistTemplate.findUnique({
    where: { id: parsedParams.data.templateId },
    include: {
      items: {
        orderBy: { rekkefolge: "asc" }
      }
    }
  });
  if (!template) {
    return NextResponse.json({ error: "Mal ikke funnet" }, { status: 404 });
  }

  return NextResponse.json({ data: template });
}

export async function PATCH(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const { session, response } = await requireRoleApi(Role.ADMIN);
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig mal-id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  await db.$transaction(async (tx) => {
    await tx.checklistTemplate.update({
      where: { id: parsedParams.data.templateId },
      data: {
        navn: parsed.data.navn,
        kategori: parsed.data.kategori
      }
    });

    await tx.checklistTemplateItem.deleteMany({
      where: { templateId: parsedParams.data.templateId }
    });

    await tx.checklistTemplateItem.createMany({
      data: parsed.data.items.map((tekst, index) => ({
        templateId: parsedParams.data.templateId,
        tekst,
        rekkefolge: index + 1
      }))
    });
  });

  const updated = await db.checklistTemplate.findUnique({
    where: { id: parsedParams.data.templateId },
    include: {
      items: {
        orderBy: { rekkefolge: "asc" }
      }
    }
  });

  if (!updated) {
    return NextResponse.json({ error: "Mal ikke funnet" }, { status: 404 });
  }

  await logAudit({
    actorId: session.user.id,
    action: "CHECKLIST_TEMPLATE_UPDATED",
    entityType: "CHECKLIST_TEMPLATE",
    entityId: updated.id,
    ipAddress: getRequestIp(request),
    metadata: { navn: updated.navn, kategori: updated.kategori, itemCount: updated.items.length }
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const { session, response } = await requireRoleApi(Role.ADMIN);
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig mal-id" }, { status: 400 });
  }

  const deleted = await db.checklistTemplate.delete({
    where: { id: parsedParams.data.templateId }
  });

  await logAudit({
    actorId: session.user.id,
    action: "CHECKLIST_TEMPLATE_DELETED",
    entityType: "CHECKLIST_TEMPLATE",
    entityId: deleted.id,
    ipAddress: getRequestIp(request),
    metadata: { navn: deleted.navn, kategori: deleted.kategori }
  });

  return NextResponse.json({ data: deleted });
}
