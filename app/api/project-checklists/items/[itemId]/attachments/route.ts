import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  itemId: z.string().cuid()
});

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function sanitizeFileExtension(file: File): string {
  const fromName = path.extname(file.name || "").toLowerCase();
  if (fromName.match(/^\.[a-z0-9]+$/)) {
    return fromName;
  }

  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  if (file.type === "image/heic") return ".heic";
  return ".bin";
}

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
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

  const item = await db.projectChecklistItem.findUnique({
    where: { id: parsedParams.data.itemId },
    select: { id: true }
  });
  if (!item) {
    return NextResponse.json({ error: "Sjekklistpunkt ikke funnet" }, { status: 404 });
  }

  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ error: "Ingen filer mottatt" }, { status: 400 });
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Kun bildefiler er tillatt" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "Fil er for stor (maks 10 MB)" }, { status: 400 });
    }
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "checklist-attachments");
  await fs.mkdir(uploadDir, { recursive: true });

  const createdAttachments = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = sanitizeFileExtension(file);
    const filename = `${randomUUID()}${extension}`;
    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, buffer);

    const filUrl = `/uploads/checklist-attachments/${filename}`;
    const created = await db.checklistItemAttachment.create({
      data: {
        checklistItemId: item.id,
        filUrl,
        filType: file.type || "application/octet-stream"
      }
    });

    createdAttachments.push(created);
  }

  await db.projectChecklistItem.update({
    where: { id: item.id },
    data: { updatedById: session.user.id }
  });

  await logAudit({
    actorId: session.user.id,
    action: "PROJECT_CHECKLIST_ITEM_ATTACHMENT_UPLOADED",
    entityType: "PROJECT_CHECKLIST_ITEM",
    entityId: item.id,
    ipAddress: getRequestIp(request),
    metadata: { attachmentCount: createdAttachments.length }
  });

  return NextResponse.json({ data: createdAttachments }, { status: 201 });
}
