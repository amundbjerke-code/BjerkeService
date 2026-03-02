import fs from "node:fs/promises";
import path from "node:path";

import { OfferType } from "@prisma/client";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { z } from "zod";

import { calculateOfferTotals } from "@/lib/offer-calculation";
import { db } from "@/lib/db";
import { getOfferStatusLabel, getOfferTypeLabel } from "@/lib/offer-meta";
import { requireAuthApi } from "@/lib/rbac";

export const runtime = "nodejs";

const paramsSchema = z.object({
  offerId: z.string().cuid()
});

function formatMoney(amount: number): string {
  return `${amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function createPdfBuffer(offerId: string) {
  const offer = await db.offer.findUnique({
    where: { id: offerId },
    include: {
      customer: true,
      specificationItems: {
        orderBy: { rekkefolge: "asc" }
      },
      project: {
        select: {
          id: true,
          navn: true
        }
      }
    }
  });

  if (!offer) {
    return null;
  }

  const totals = calculateOfferTotals({
    timeEstimateHours: offer.timeEstimateHours,
    hourlyRateEksMva: offer.hourlyRateEksMva,
    materialCostEksMva: offer.materialCostEksMva,
    markupPercent: offer.markupPercent,
    riskBufferPercent: offer.riskBufferPercent,
    mvaPercent: offer.mvaPercent
  });

  const logoPath = path.join(process.cwd(), "public", "bjerke-logo.svg");
  const logoSvg = await fs.readFile(logoPath, "utf8").catch(() => null);

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  if (logoSvg) {
    SVGtoPDF(doc, logoSvg, 48, 36, { width: 180, height: 90, preserveAspectRatio: "xMinYMin meet" });
  }

  doc
    .fontSize(24)
    .fillColor("#111827")
    .text("Tilbud", 340, 52, { width: 210, align: "right" })
    .fontSize(10)
    .fillColor("#4b5563")
    .text(`Tilbuds-ID: ${offer.id}`, 340, 86, { width: 210, align: "right" })
    .text(`Dato: ${formatDate(offer.createdAt)}`, 340, 100, { width: 210, align: "right" });

  let y = 142;

  doc
    .moveTo(48, y)
    .lineTo(547, y)
    .strokeColor("#e5e7eb")
    .stroke();

  y += 16;

  doc
    .fontSize(11)
    .fillColor("#111827")
    .text(`Kunde: ${offer.customer.navn}`, 48, y)
    .text(`Status: ${getOfferStatusLabel(offer.status)}`, 320, y);

  y += 14;

  doc
    .fontSize(10)
    .fillColor("#374151")
    .text(`E-post: ${offer.customer.epost}`, 48, y)
    .text(`Telefon: ${offer.customer.telefon}`, 320, y);

  y += 14;

  doc.text(`Adresse: ${offer.customer.adresse}, ${offer.customer.postnr} ${offer.customer.poststed}`, 48, y, { width: 500 });

  y += 26;

  doc
    .fontSize(14)
    .fillColor("#111827")
    .text(offer.navn, 48, y)
    .fontSize(10)
    .fillColor("#4b5563")
    .text(`Type: ${getOfferTypeLabel(offer.offerType)}`, 48, y + 18);

  if (offer.beskrivelse) {
    y += 34;
    doc.fontSize(10).fillColor("#374151").text(offer.beskrivelse, 48, y, { width: 500 });
    y = doc.y + 10;
  } else {
    y += 34;
  }

  doc
    .moveTo(48, y)
    .lineTo(547, y)
    .strokeColor("#e5e7eb")
    .stroke();

  y += 12;

  doc.fontSize(11).fillColor("#111827").text("Spesifikasjon", 48, y);
  y += 18;

  doc
    .fontSize(9)
    .fillColor("#6b7280")
    .text("Beskrivelse", 48, y)
    .text("Belop eks mva", 430, y, { width: 117, align: "right" });

  y += 12;

  doc
    .moveTo(48, y)
    .lineTo(547, y)
    .strokeColor("#e5e7eb")
    .stroke();

  y += 8;

  const calcRows = [
    { label: `Timeestimat (${offer.timeEstimateHours.toFixed(2)} t x ${formatMoney(offer.hourlyRateEksMva)})`, amount: totals.laborCostEksMva },
    { label: "Materialkost", amount: offer.materialCostEksMva },
    { label: `Paslag (${offer.markupPercent.toFixed(2)}%)`, amount: totals.markupAmountEksMva },
    { label: `Risiko-buffer (${offer.riskBufferPercent.toFixed(2)}%)`, amount: totals.riskAmountEksMva }
  ];

  const specRows = offer.specificationItems.map((item) => ({
    label: item.tekst,
    amount: item.belopEksMva
  }));

  const rows = [...specRows, ...calcRows];

  for (const row of rows) {
    if (y > 700) {
      doc.addPage();
      y = 60;
    }

    doc
      .fontSize(10)
      .fillColor("#111827")
      .text(row.label, 48, y, { width: 360 })
      .text(typeof row.amount === "number" ? formatMoney(row.amount) : "-", 430, y, { width: 117, align: "right" });

    y += 14;
  }

  y += 8;

  doc
    .moveTo(48, y)
    .lineTo(547, y)
    .strokeColor("#d1d5db")
    .stroke();

  y += 14;

  doc
    .fontSize(11)
    .fillColor("#111827")
    .text("Total eks mva", 300, y, { width: 120, align: "right" })
    .text(formatMoney(offer.totalEksMva), 430, y, { width: 117, align: "right" });

  y += 15;

  doc
    .fontSize(10)
    .fillColor("#374151")
    .text(`Mva (${offer.mvaPercent.toFixed(2)}%)`, 300, y, { width: 120, align: "right" })
    .text(formatMoney(offer.totalInkMva - offer.totalEksMva), 430, y, { width: 117, align: "right" });

  y += 16;

  doc
    .fontSize(13)
    .fillColor("#b91c1c")
    .text("Total inkl mva", 300, y, { width: 120, align: "right" })
    .text(formatMoney(offer.totalInkMva), 430, y, { width: 117, align: "right" });

  y += 28;

  const typeDescription =
    offer.offerType === OfferType.FASTPRIS
      ? "Tilbudet gjelder fastpris med avtalt totalpris eks mva."
      : "Tilbudet er timebasert og endelig fakturering skjer etter medgatt tid.";

  doc
    .fontSize(9)
    .fillColor("#4b5563")
    .text(typeDescription, 48, y, { width: 500 })
    .text(
      offer.project ? `Konvertert til prosjekt: ${offer.project.navn} (${offer.project.id})` : "Ikke konvertert til prosjekt enda.",
      48,
      y + 14,
      { width: 500 }
    );

  doc.end();

  const buffer = await done;
  return {
    buffer,
    offerName: offer.navn
  };
}

export async function GET(_request: Request, context: { params: Promise<{ offerId: string }> }) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig tilbud-id" }, { status: 400 });
  }

  const result = await createPdfBuffer(parsedParams.data.offerId);
  if (!result) {
    return NextResponse.json({ error: "Tilbud ikke funnet" }, { status: 404 });
  }

  const safeName = sanitizeFileName(result.offerName || "tilbud");

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="tilbud-${safeName || "dokument"}.pdf"`
    }
  });
}
