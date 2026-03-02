import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

export const runtime = "nodejs";

const paramsSchema = z.object({
  projectId: z.string().cuid()
});

type FdvImageEntry = {
  filUrl: string;
  filType: string;
  source: string;
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function resolveLocalPathFromPublicUrl(fileUrl: string): string | null {
  if (!fileUrl.startsWith("/")) {
    return null;
  }
  const normalized = fileUrl.replace(/^\//, "").replace(/\//g, path.sep);
  return path.join(process.cwd(), "public", normalized);
}

function isEmbeddableImage(fileType: string): boolean {
  return fileType === "image/jpeg" || fileType === "image/png";
}

async function createFdvPdfBuffer(projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      customer: true,
      productDocuments: {
        orderBy: [{ createdAt: "asc" }]
      },
      fdvHandover: {
        include: {
          createdBy: {
            select: {
              name: true
            }
          }
        }
      },
      checklists: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          items: {
            orderBy: [{ rekkefolge: "asc" }],
            include: {
              attachments: {
                orderBy: [{ createdAt: "asc" }]
              }
            }
          }
        }
      },
      avvik: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          attachments: {
            orderBy: [{ createdAt: "asc" }]
          }
        }
      }
    }
  });

  if (!project) {
    return null;
  }

  const checklistRows = project.checklists.map((checklist) => {
    const totalItems = checklist.items.length;
    const answeredItems = checklist.items.filter((item) => item.svar !== null).length;
    const imageCount = checklist.items.reduce((sum, item) => sum + item.attachments.length, 0);
    return {
      navn: checklist.navn,
      totalItems,
      answeredItems,
      imageCount
    };
  });

  const checklistImages: FdvImageEntry[] = project.checklists.flatMap((checklist) =>
    checklist.items.flatMap((item) =>
      item.attachments.map((attachment) => ({
        filUrl: attachment.filUrl,
        filType: attachment.filType,
        source: `Sjekkliste: ${checklist.navn}`
      }))
    )
  );
  const avvikImages: FdvImageEntry[] = project.avvik.flatMap((avvik) =>
    avvik.attachments.map((attachment) => ({
      filUrl: attachment.filUrl,
      filType: attachment.filType,
      source: `Avvik: ${avvik.tittel}`
    }))
  );
  const allImages = [...checklistImages, ...avvikImages];

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageBottom = () => doc.page.height - 48;
  const ensureSpace = (height: number) => {
    if (doc.y + height > pageBottom()) {
      doc.addPage();
      doc.y = 48;
    }
  };

  doc.fontSize(22).fillColor("#111827").text("FDV-pakke", { align: "left" });
  doc.moveDown(0.2);
  doc.fontSize(12).fillColor("#111827").text(project.navn);
  doc.fontSize(10).fillColor("#4b5563").text(`Kunde: ${project.customer.navn}`);
  doc.text(`Generert: ${formatDateTime(new Date())}`);
  doc.moveDown(0.8);

  doc.fontSize(12).fillColor("#111827").text("Innhold");
  doc.moveDown(0.2);
  doc.fontSize(10).fillColor("#374151");
  doc.text(`- Sjekklister: ${project.checklists.length}`);
  doc.text(`- Sjekklistepunkter besvart: ${checklistRows.reduce((sum, row) => sum + row.answeredItems, 0)} av ${checklistRows.reduce((sum, row) => sum + row.totalItems, 0)}`);
  doc.text(`- Bilder (auto samlet): ${allImages.length}`);
  doc.text(`- Produktdokumenter: ${project.productDocuments.length}`);
  doc.text(`- Signering: ${project.fdvHandover ? "Ja" : "Nei"}`);
  doc.moveDown(0.8);

  ensureSpace(80);
  doc.fontSize(12).fillColor("#111827").text("Sjekklister");
  doc.moveDown(0.2);
  if (checklistRows.length === 0) {
    doc.fontSize(10).fillColor("#6b7280").text("Ingen sjekklister registrert.");
  } else {
    for (const row of checklistRows) {
      ensureSpace(30);
      doc
        .fontSize(10)
        .fillColor("#111827")
        .text(`${row.navn}`, { continued: true })
        .fillColor("#4b5563")
        .text(` - Besvart ${row.answeredItems}/${row.totalItems}, bilder ${row.imageCount}`);
    }
  }

  doc.moveDown(0.8);
  ensureSpace(80);
  doc.fontSize(12).fillColor("#111827").text("Produktdokumentasjon");
  doc.moveDown(0.2);
  if (project.productDocuments.length === 0) {
    doc.fontSize(10).fillColor("#6b7280").text("Ingen produktdokumenter registrert.");
  } else {
    for (const item of project.productDocuments) {
      ensureSpace(34);
      doc.fontSize(10).fillColor("#111827").text(item.tittel);
      doc.fontSize(9).fillColor("#4b5563").text(`Fil: ${item.filUrl}`);
      if (item.notat) {
        doc.fontSize(9).fillColor("#6b7280").text(`Notat: ${item.notat}`);
      }
    }
  }

  doc.moveDown(0.8);
  ensureSpace(80);
  doc.fontSize(12).fillColor("#111827").text("Signering ved overlevering");
  doc.moveDown(0.2);
  if (!project.fdvHandover) {
    doc.fontSize(10).fillColor("#6b7280").text("Ikke signert enda.");
  } else {
    doc.fontSize(10).fillColor("#111827").text(`Kunde/representant: ${project.fdvHandover.customerName}`);
    doc.text(`Kundens signatur (navn): ${project.fdvHandover.customerSignature}`);
    doc.text(`Signert av (Bjerke Service): ${project.fdvHandover.signedByName}`);
    doc.text(`Dato: ${formatDate(project.fdvHandover.signedAt)}`);
    if (project.fdvHandover.note) {
      doc.text(`Notat: ${project.fdvHandover.note}`);
    }
    doc
      .fontSize(9)
      .fillColor("#4b5563")
      .text(`Registrert av ${project.fdvHandover.createdBy.name} (${formatDateTime(project.fdvHandover.updatedAt)})`);
  }

  doc.addPage();
  doc.fontSize(12).fillColor("#111827").text("Bilder (automatisk samlet)");
  doc.moveDown(0.4);

  const embedCandidates = allImages.filter((entry) => isEmbeddableImage(entry.filType)).slice(0, 12);
  if (embedCandidates.length === 0) {
    doc.fontSize(10).fillColor("#6b7280").text("Ingen JPG/PNG-bilder tilgjengelig for PDF-visning.");
  } else {
    let rowTop = doc.y;
    for (let index = 0; index < embedCandidates.length; index += 1) {
      const image = embedCandidates[index];
      const column = index % 2;
      const x = column === 0 ? 48 : 306;
      if (column === 0 && index > 0) {
        rowTop += 176;
      }
      if (rowTop + 170 > pageBottom()) {
        doc.addPage();
        rowTop = 48;
      }

      const localPath = resolveLocalPathFromPublicUrl(image.filUrl);
      if (localPath) {
        const exists = await fs
          .access(localPath)
          .then(() => true)
          .catch(() => false);

        if (exists) {
          try {
            doc.image(localPath, x, rowTop, { fit: [230, 130], align: "center", valign: "center" });
          } catch {
            doc
              .fontSize(8)
              .fillColor("#9ca3af")
              .text("Klarte ikke a vise bilde", x, rowTop + 56, { width: 230, align: "center" });
          }
        } else {
          doc
            .fontSize(8)
            .fillColor("#9ca3af")
            .text("Bilde mangler pa disk", x, rowTop + 56, { width: 230, align: "center" });
        }
      }

      doc.fontSize(8).fillColor("#4b5563").text(image.source, x, rowTop + 136, { width: 230, ellipsis: true });
      doc.fontSize(8).fillColor("#6b7280").text(image.filUrl, x, rowTop + 147, { width: 230, ellipsis: true });
    }
  }

  doc.end();

  const buffer = await done;
  return {
    buffer,
    projectName: project.navn
  };
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig prosjekt-id" }, { status: 400 });
  }

  const result = await createFdvPdfBuffer(parsedParams.data.projectId);
  if (!result) {
    return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
  }

  const safeName = sanitizeFileName(result.projectName || "prosjekt");
  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="fdv-${safeName || "pakke"}.pdf"`
    }
  });
}
