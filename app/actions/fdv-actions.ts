"use server";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const uploadProductDocumentSchema = z.object({
  projectId: z.string().cuid(),
  tittel: z.string().trim().min(2).max(200),
  notat: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const deleteProductDocumentSchema = z.object({
  documentId: z.string().cuid(),
  projectId: z.string().cuid()
});

const signFdvHandoverSchema = z.object({
  projectId: z.string().cuid(),
  customerName: z.string().trim().min(2).max(160),
  customerSignature: z.string().trim().min(2).max(160),
  signedByName: z.string().trim().min(2).max(160),
  signedAt: dateStringSchema,
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

function sanitizeFileExtension(file: File): string {
  const fromName = path.extname(file.name || "").toLowerCase();
  if (fromName.match(/^\.[a-z0-9]+$/)) {
    return fromName;
  }

  if (file.type === "application/pdf") return ".pdf";
  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  if (file.type === "application/msword") return ".doc";
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (file.type === "text/plain") return ".txt";
  return ".bin";
}

function resolveLocalUploadedPath(fileUrl: string): string | null {
  if (!fileUrl.startsWith("/uploads/fdv-product-documents/")) {
    return null;
  }
  const normalized = fileUrl.replace(/\//g, path.sep);
  return path.join(process.cwd(), "public", normalized);
}

export async function uploadProjectProductDocumentAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = uploadProductDocumentSchema.safeParse({
    projectId: formData.get("projectId"),
    tittel: formData.get("tittel"),
    notat: formData.get("notat")
  });

  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldig%20produktdokument");
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File) || fileEntry.size <= 0) {
    redirect(`/prosjekter/${parsed.data.projectId}/fdv?error=Velg%20en%20fil`);
  }
  if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
    redirect(`/prosjekter/${parsed.data.projectId}/fdv?error=Filen%20er%20for%20stor%20(maks%2025MB)`);
  }

  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "fdv-product-documents");
    await fs.mkdir(uploadDir, { recursive: true });

    const extension = sanitizeFileExtension(fileEntry);
    const filename = `${randomUUID()}${extension}`;
    const filePath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const filUrl = `/uploads/fdv-product-documents/${filename}`;
    const created = await db.projectProductDocument.create({
      data: {
        projectId: parsed.data.projectId,
        tittel: parsed.data.tittel,
        filUrl,
        filType: fileEntry.type || "application/octet-stream",
        notat: parsed.data.notat,
        createdById: session.user.id
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_PRODUCT_DOCUMENT_UPLOADED",
      entityType: "PROJECT_PRODUCT_DOCUMENT",
      entityId: created.id,
      metadata: {
        projectId: created.projectId,
        tittel: created.tittel,
        filType: created.filType
      }
    });

    redirect(`/prosjekter/${parsed.data.projectId}/fdv?success=fdv-doc-uploaded`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}/fdv?error=Klarte%20ikke%20a%20laste%20opp%20dokument`);
  }
}

export async function deleteProjectProductDocumentAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = deleteProductDocumentSchema.safeParse({
    documentId: formData.get("documentId"),
    projectId: formData.get("projectId")
  });

  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldig%20produktdokument");
  }

  try {
    const existing = await db.projectProductDocument.findUnique({
      where: { id: parsed.data.documentId },
      select: {
        id: true,
        projectId: true,
        tittel: true,
        filUrl: true
      }
    });
    if (!existing || existing.projectId !== parsed.data.projectId) {
      redirect(`/prosjekter/${parsed.data.projectId}/fdv?error=Dokument%20ikke%20funnet`);
    }

    await db.projectProductDocument.delete({
      where: { id: existing.id }
    });

    const localPath = resolveLocalUploadedPath(existing.filUrl);
    if (localPath) {
      await fs.unlink(localPath).catch(() => null);
    }

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_PRODUCT_DOCUMENT_DELETED",
      entityType: "PROJECT_PRODUCT_DOCUMENT",
      entityId: existing.id,
      metadata: {
        projectId: existing.projectId,
        tittel: existing.tittel
      }
    });

    redirect(`/prosjekter/${parsed.data.projectId}/fdv?success=fdv-doc-deleted`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}/fdv?error=Klarte%20ikke%20a%20slette%20dokument`);
  }
}

export async function signProjectFdvHandoverAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = signFdvHandoverSchema.safeParse({
    projectId: formData.get("projectId"),
    customerName: formData.get("customerName"),
    customerSignature: formData.get("customerSignature"),
    signedByName: formData.get("signedByName"),
    signedAt: formData.get("signedAt"),
    note: formData.get("note")
  });

  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldig%20FDV-signering");
  }

  const signedAtDate = new Date(`${parsed.data.signedAt}T00:00:00`);
  if (Number.isNaN(signedAtDate.getTime())) {
    redirect(`/prosjekter/${parsed.data.projectId}/fdv?error=Ugyldig%20dato`);
  }

  try {
    const current = await db.projectFdvHandover.findUnique({
      where: { projectId: parsed.data.projectId },
      select: { id: true }
    });

    const saved = await db.projectFdvHandover.upsert({
      where: { projectId: parsed.data.projectId },
      create: {
        projectId: parsed.data.projectId,
        customerName: parsed.data.customerName,
        customerSignature: parsed.data.customerSignature,
        signedByName: parsed.data.signedByName,
        signedAt: signedAtDate,
        note: parsed.data.note,
        createdById: session.user.id
      },
      update: {
        customerName: parsed.data.customerName,
        customerSignature: parsed.data.customerSignature,
        signedByName: parsed.data.signedByName,
        signedAt: signedAtDate,
        note: parsed.data.note,
        createdById: session.user.id
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: current ? "PROJECT_FDV_HANDOVER_UPDATED" : "PROJECT_FDV_HANDOVER_SIGNED",
      entityType: "PROJECT_FDV_HANDOVER",
      entityId: saved.id,
      metadata: {
        projectId: saved.projectId,
        signedAt: saved.signedAt,
        customerName: saved.customerName,
        signedByName: saved.signedByName
      }
    });

    redirect(`/prosjekter/${parsed.data.projectId}/fdv?success=fdv-signed`);
  } catch (error) {
    console.error(error);
    redirect(`/prosjekter/${parsed.data.projectId}/fdv?error=Klarte%20ikke%20a%20lagre%20signering`);
  }
}
