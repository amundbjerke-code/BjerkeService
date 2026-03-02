import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  projectId: z.string().cuid()
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatMoney(amount: number | null): string {
  if (amount === null) return "-";
  return `${amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function svarLabel(svar: string | null): string {
  if (svar === "JA") return "Ja";
  if (svar === "NEI") return "Nei";
  if (svar === "IKKE_RELEVANT") return "Ikke relevant";
  return "Ikke besvart";
}

function svarColor(svar: string | null): string {
  if (svar === "JA") return "#16a34a";
  if (svar === "NEI") return "#dc2626";
  if (svar === "IKKE_RELEVANT") return "#6b7280";
  return "#d97706";
}

function alvorlighetLabel(grad: string): string {
  if (grad === "LAV") return "Lav";
  if (grad === "MIDDELS") return "Middels";
  if (grad === "HOY") return "Hoy";
  if (grad === "KRITISK") return "Kritisk";
  return grad;
}

function alvorlighetColor(grad: string): string {
  if (grad === "LAV") return "#3b82f6";
  if (grad === "MIDDELS") return "#eab308";
  if (grad === "HOY") return "#f97316";
  if (grad === "KRITISK") return "#dc2626";
  return "#6b7280";
}

function avvikStatusLabel(status: string): string {
  if (status === "APENT") return "Apent";
  if (status === "UNDER_BEHANDLING") return "Under behandling";
  if (status === "LUKKET") return "Lukket";
  return status;
}

function materialStatusLabel(status: string): string {
  if (status === "TRENGS") return "Trengs";
  if (status === "BESTILT") return "Bestilt";
  if (status === "MOTTATT") return "Mottatt";
  return status;
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) return response;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig prosjekt-id" }, { status: 400 });
  }

  const projectId = parsedParams.data.projectId;

  const [project, checklists, timeSummary, avvikList, materialList] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      include: {
        customer: true
      }
    }),
    db.projectChecklist.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: {
        createdBy: { select: { name: true } },
        items: {
          orderBy: { rekkefolge: "asc" },
          include: {
            attachments: { orderBy: { createdAt: "asc" } }
          }
        }
      }
    }),
    db.timeEntry.aggregate({
      where: { projectId },
      _sum: { timer: true, belopEksMva: true },
      _count: { _all: true }
    }),
    db.avvik.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: {
        registrertAv: { select: { name: true } },
        lukketAv: { select: { name: true } },
        attachments: { orderBy: { createdAt: "asc" } }
      }
    }),
    db.materialItem.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }]
    })
  ]);

  if (!project) {
    return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
  }

  const totalHours = timeSummary._sum.timer ?? 0;
  const totalAmount = timeSummary._sum.belopEksMva ?? 0;
  const totalEntries = timeSummary._count._all;

  let checklistsHtml = "";
  for (const checklist of checklists) {
    const answered = checklist.items.filter((i) => i.svar !== null).length;
    const total = checklist.items.length;

    checklistsHtml += `<div class="section">`;
    checklistsHtml += `<h3>${escapeHtml(checklist.navn)} <span class="badge">${answered}/${total} besvart</span></h3>`;
    checklistsHtml += `<p class="meta">Opprettet av ${escapeHtml(checklist.createdBy.name)} - ${formatDate(checklist.createdAt)}</p>`;
    checklistsHtml += `<table><thead><tr><th>#</th><th>Punkt</th><th>Svar</th><th>Kommentar</th></tr></thead><tbody>`;

    for (const item of checklist.items) {
      checklistsHtml += `<tr>`;
      checklistsHtml += `<td>${item.rekkefolge}</td>`;
      checklistsHtml += `<td>${escapeHtml(item.tekst)}</td>`;
      checklistsHtml += `<td><span style="color:${svarColor(item.svar)};font-weight:600">${svarLabel(item.svar)}</span></td>`;
      checklistsHtml += `<td>${item.kommentar ? escapeHtml(item.kommentar) : "-"}</td>`;
      checklistsHtml += `</tr>`;

      if (item.attachments.length > 0) {
        checklistsHtml += `<tr><td colspan="4"><div class="images">`;
        for (const att of item.attachments) {
          checklistsHtml += `<img src="${escapeHtml(att.filUrl)}" alt="Vedlegg" />`;
        }
        checklistsHtml += `</div></td></tr>`;
      }
    }

    checklistsHtml += `</tbody></table></div>`;
  }

  let avvikHtml = "";
  if (avvikList.length > 0) {
    avvikHtml += `<div class="section"><h2>Avvik/HMS</h2>`;
    for (const avvik of avvikList) {
      avvikHtml += `<div class="avvik-card">`;
      avvikHtml += `<h3>${escapeHtml(avvik.tittel)} <span class="badge" style="background:${alvorlighetColor(avvik.alvorlighetsgrad)};color:#fff">${alvorlighetLabel(avvik.alvorlighetsgrad)}</span> <span class="badge">${avvikStatusLabel(avvik.status)}</span></h3>`;
      avvikHtml += `<p>${escapeHtml(avvik.beskrivelse)}</p>`;
      avvikHtml += `<p class="meta">Registrert av ${escapeHtml(avvik.registrertAv.name)} - ${formatDate(avvik.createdAt)}</p>`;
      if (avvik.tiltak) {
        avvikHtml += `<p><strong>Tiltak:</strong> ${escapeHtml(avvik.tiltak)}</p>`;
      }
      if (avvik.lukketAv && avvik.lukketDato) {
        avvikHtml += `<p class="meta">Lukket av ${escapeHtml(avvik.lukketAv.name)} - ${formatDate(avvik.lukketDato)}</p>`;
      }
      if (avvik.attachments.length > 0) {
        avvikHtml += `<div class="images">`;
        for (const att of avvik.attachments) {
          avvikHtml += `<img src="${escapeHtml(att.filUrl)}" alt="Avviksvedlegg" />`;
        }
        avvikHtml += `</div>`;
      }
      avvikHtml += `</div>`;
    }
    avvikHtml += `</div>`;
  }

  let materialHtml = "";
  if (materialList.length > 0) {
    const totalEstimert = materialList.reduce((sum, item) => sum + (item.estimertPris ?? 0), 0);
    materialHtml += `<div class="section"><h2>Materialer</h2>`;
    materialHtml += `<table><thead><tr><th>Navn</th><th>Antall</th><th>Enhet</th><th>Est. pris</th><th>Status</th></tr></thead><tbody>`;
    for (const item of materialList) {
      materialHtml += `<tr>`;
      materialHtml += `<td>${escapeHtml(item.navn)}</td>`;
      materialHtml += `<td>${item.antall}</td>`;
      materialHtml += `<td>${escapeHtml(item.enhet)}</td>`;
      materialHtml += `<td>${item.estimertPris !== null ? formatMoney(item.estimertPris) : "-"}</td>`;
      materialHtml += `<td>${materialStatusLabel(item.status)}</td>`;
      materialHtml += `</tr>`;
    }
    materialHtml += `</tbody></table>`;
    if (totalEstimert > 0) {
      materialHtml += `<p class="total">Total estimert materialkostnad: ${formatMoney(totalEstimert)}</p>`;
    }
    materialHtml += `</div>`;
  }

  const statusLabel: Record<string, string> = {
    PLANLAGT: "Planlagt",
    PAGAR: "Pagar",
    FERDIG: "Ferdig",
    FAKTURERT: "Fakturert"
  };

  const billingLabel: Record<string, string> = {
    TIME: "Time",
    FASTPRIS: "Fastpris"
  };

  const html = `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Prosjektrapport - ${escapeHtml(project.navn)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; line-height: 1.5; padding: 2rem; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.25rem; margin-bottom: 0.75rem; border-bottom: 2px solid #dd1f2a; padding-bottom: 0.25rem; }
  h3 { font-size: 1rem; margin-bottom: 0.5rem; }
  .header { margin-bottom: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 1rem; }
  .header p { font-size: 0.875rem; color: #6b7280; }
  .meta { font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem; }
  .section { margin-bottom: 2rem; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem; }
  .summary-box { background: #f3f3f3; border-radius: 8px; padding: 1rem; }
  .summary-box .label { font-size: 0.75rem; text-transform: uppercase; color: #6b7280; }
  .summary-box .value { font-size: 1.125rem; font-weight: 600; margin-top: 0.25rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin-bottom: 1rem; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
  th { background: #f3f3f3; font-size: 0.75rem; text-transform: uppercase; color: #6b7280; }
  .badge { display: inline-block; font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 9999px; background: #f3f3f3; margin-left: 0.5rem; }
  .images { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 0.5rem 0; }
  .images img { width: 100%; height: 150px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb; }
  .avvik-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .total { font-weight: 600; margin-top: 0.5rem; }
  .print-btn { background: #dd1f2a; color: #fff; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; margin-bottom: 2rem; }
  .print-btn:hover { background: #b71c24; }
  @media print {
    .print-btn { display: none; }
    body { padding: 0; }
    .images img { height: 120px; }
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Skriv ut / Lagre som PDF</button>

<div class="header">
  <h1>${escapeHtml(project.navn)}</h1>
  <p><strong>Kunde:</strong> ${escapeHtml(project.customer.navn)}${project.customer.orgnr ? ` (${escapeHtml(project.customer.orgnr)})` : ""}</p>
  <p><strong>Adresse:</strong> ${escapeHtml(project.adresse ?? `${project.customer.adresse}, ${project.customer.postnr} ${project.customer.poststed}`)}</p>
  <p><strong>Status:</strong> ${statusLabel[project.status] ?? project.status} | <strong>Billingtype:</strong> ${billingLabel[project.billingType] ?? project.billingType}</p>
  <p><strong>Periode:</strong> ${project.startDato ? formatDate(project.startDato) : "-"} til ${project.sluttDato ? formatDate(project.sluttDato) : "pagaende"}</p>
  <p class="meta">Rapport generert ${formatDate(new Date())}</p>
</div>

<div class="section">
  <h2>Sammendrag</h2>
  <div class="summary-grid">
    <div class="summary-box">
      <div class="label">Timer totalt</div>
      <div class="value">${totalHours.toLocaleString("nb-NO", { minimumFractionDigits: 2 })} t</div>
    </div>
    <div class="summary-box">
      <div class="label">Belop eks mva</div>
      <div class="value">${formatMoney(totalAmount)}</div>
    </div>
    <div class="summary-box">
      <div class="label">Registreringer</div>
      <div class="value">${totalEntries}</div>
    </div>
  </div>
</div>

${checklists.length > 0 ? `<div class="section"><h2>Sjekklister</h2>${checklistsHtml}</div>` : ""}

${avvikHtml}

${materialHtml}

</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}
