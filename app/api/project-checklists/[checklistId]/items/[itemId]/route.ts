import { ChecklistItemAnswer } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  checklistId: z.string().cuid(),
  itemId: z.string().cuid()
});

const updateSchema = z.object({
  svar: z.nativeEnum(ChecklistItemAnswer).nullable().optional(),
  kommentar: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ checklistId: string; itemId: string }> }
) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig item-id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = updateSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  const item = await db.projectChecklistItem.findFirst({
    where: {
      id: parsedParams.data.itemId,
      checklistId: parsedParams.data.checklistId
    },
    select: {
      id: true,
      checklistId: true
    }
  });
  if (!item) {
    return NextResponse.json({ error: "Sjekklistpunkt ikke funnet" }, { status: 404 });
  }

  const updated = await db.projectChecklistItem.update({
    where: { id: item.id },
    data: {
      svar: parsedBody.data.svar ?? null,
      kommentar: parsedBody.data.kommentar ?? null,
      updatedById: session.user.id
    },
    include: {
      attachments: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  await logAudit({
    actorId: session.user.id,
    action: "PROJECT_CHECKLIST_ITEM_UPDATED",
    entityType: "PROJECT_CHECKLIST_ITEM",
    entityId: updated.id,
    ipAddress: getRequestIp(request),
    metadata: { checklistId: updated.checklistId, svar: updated.svar }
  });

  return NextResponse.json({ data: updated });
}
