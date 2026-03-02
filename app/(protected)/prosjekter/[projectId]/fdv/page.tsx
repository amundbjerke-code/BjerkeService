import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteProjectProductDocumentAction,
  signProjectFdvHandoverAction,
  uploadProjectProductDocumentAction
} from "@/app/actions/fdv-actions";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";
import { formatDateInput } from "@/lib/time-period";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSuccessMessage(value: string): string | null {
  if (value === "fdv-doc-uploaded") return "Produktdokumentasjon ble lastet opp.";
  if (value === "fdv-doc-deleted") return "Produktdokumentasjon ble slettet.";
  if (value === "fdv-signed") return "FDV-overlevering ble signert.";
  return null;
}

function formatDateTime(value: Date): string {
  return value.toLocaleString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function ProjectFdvPage({ params, searchParams }: Props) {
  const session = await requireAuthPage();
  const { projectId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const error = toSingleValue(resolvedSearchParams.error);
  const success = getSuccessMessage(toSingleValue(resolvedSearchParams.success));

  const [project, checklists, avvikList, productDocuments, fdvHandover] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      include: {
        customer: {
          select: {
            navn: true
          }
        }
      }
    }),
    db.projectChecklist.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }],
      include: {
        items: {
          select: {
            id: true,
            svar: true,
            attachments: {
              select: {
                id: true,
                filUrl: true,
                createdAt: true
              }
            }
          }
        }
      }
    }),
    db.avvik.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        tittel: true,
        attachments: {
          select: {
            id: true,
            filUrl: true,
            createdAt: true
          }
        }
      }
    }),
    db.projectProductDocument.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }],
      include: {
        createdBy: {
          select: {
            name: true
          }
        }
      }
    }),
    db.projectFdvHandover.findUnique({
      where: { projectId },
      include: {
        createdBy: {
          select: {
            name: true
          }
        }
      }
    })
  ]);

  if (!project) {
    notFound();
  }

  const checklistSummary = checklists.map((checklist) => {
    const totalItems = checklist.items.length;
    const answeredItems = checklist.items.filter((item) => item.svar !== null).length;
    const imageCount = checklist.items.reduce((sum, item) => sum + item.attachments.length, 0);
    return {
      id: checklist.id,
      navn: checklist.navn,
      totalItems,
      answeredItems,
      imageCount
    };
  });

  const checklistImageEntries = checklists.flatMap((checklist) =>
    checklist.items.flatMap((item) =>
      item.attachments.map((attachment) => ({
        id: attachment.id,
        filUrl: attachment.filUrl,
        createdAt: attachment.createdAt,
        source: `Sjekkliste: ${checklist.navn}`
      }))
    )
  );

  const avvikImageEntries = avvikList.flatMap((avvik) =>
    avvik.attachments.map((attachment) => ({
      id: attachment.id,
      filUrl: attachment.filUrl,
      createdAt: attachment.createdAt,
      source: `Avvik: ${avvik.tittel}`
    }))
  );

  const imageEntries = [...checklistImageEntries, ...avvikImageEntries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const totalChecklistItems = checklistSummary.reduce((sum, row) => sum + row.totalItems, 0);
  const totalChecklistAnswered = checklistSummary.reduce((sum, row) => sum + row.answeredItems, 0);
  const totalImages = imageEntries.length;
  const totalDocuments = productDocuments.length;
  const todayValue = formatDateInput(new Date());

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">FDV-pakke</h1>
            <p className="mt-1 text-sm text-brand-ink/80">
              {project.navn} - {project.customer.navn}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/prosjekter/${project.id}#dokumenter`} className="rounded-lg bg-brand-canvas px-3 py-2 text-sm font-semibold hover:bg-brand-canvas/80">
              Til prosjekt
            </Link>
            <a href={`/api/prosjekter/${project.id}/fdv-pdf`} target="_blank" rel="noreferrer" className="brand-button inline-block px-3 py-2 text-sm">
              Generer FDV-PDF
            </a>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="brand-card p-4">
          <p className="text-xs uppercase text-brand-ink/70">Bilder (auto)</p>
          <p className="mt-1 text-lg font-semibold">{totalImages}</p>
        </div>
        <div className="brand-card p-4">
          <p className="text-xs uppercase text-brand-ink/70">Sjekklistepunkter</p>
          <p className="mt-1 text-lg font-semibold">
            {totalChecklistAnswered}/{totalChecklistItems}
          </p>
        </div>
        <div className="brand-card p-4">
          <p className="text-xs uppercase text-brand-ink/70">Produktdokumenter</p>
          <p className="mt-1 text-lg font-semibold">{totalDocuments}</p>
        </div>
        <div className="brand-card p-4">
          <p className="text-xs uppercase text-brand-ink/70">Overlevering</p>
          <p className="mt-1 text-lg font-semibold">{fdvHandover ? "Signert" : "Ikke signert"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-4">
          <form action={uploadProjectProductDocumentAction} className="brand-card space-y-3 p-4" encType="multipart/form-data">
            <input type="hidden" name="projectId" value={project.id} />
            <h2 className="text-lg font-semibold">Legg til produktdokumentasjon</h2>
            <label className="block text-sm font-medium">
              Tittel
              <input name="tittel" className="brand-input mt-1" required minLength={2} maxLength={200} placeholder="F.eks. Produktdatablad - Varmtvannsbereder" />
            </label>
            <label className="block text-sm font-medium">
              Fil
              <input
                name="file"
                type="file"
                className="brand-input mt-1"
                required
                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp"
              />
            </label>
            <label className="block text-sm font-medium">
              Notat (valgfritt)
              <textarea name="notat" className="brand-input mt-1 min-h-20 resize-y" maxLength={1000} />
            </label>
            <button type="submit" className="brand-button w-full">
              Last opp dokument
            </button>
          </form>

          <form action={signProjectFdvHandoverAction} className="brand-card space-y-3 p-4">
            <input type="hidden" name="projectId" value={project.id} />
            <h2 className="text-lg font-semibold">Signering ved overlevering</h2>
            <label className="block text-sm font-medium">
              Kunde / representant
              <input name="customerName" className="brand-input mt-1" required minLength={2} maxLength={160} defaultValue={fdvHandover?.customerName ?? project.customer.navn} />
            </label>
            <label className="block text-sm font-medium">
              Kundens signatur (fullt navn)
              <input
                name="customerSignature"
                className="brand-input mt-1"
                required
                minLength={2}
                maxLength={160}
                defaultValue={fdvHandover?.customerSignature ?? ""}
              />
            </label>
            <label className="block text-sm font-medium">
              Signert av (Bjerke Service)
              <input
                name="signedByName"
                className="brand-input mt-1"
                required
                minLength={2}
                maxLength={160}
                defaultValue={fdvHandover?.signedByName ?? (session.user.name ?? "")}
              />
            </label>
            <label className="block text-sm font-medium">
              Dato
              <input name="signedAt" type="date" className="brand-input mt-1" required defaultValue={fdvHandover ? formatDateInput(fdvHandover.signedAt) : todayValue} />
            </label>
            <label className="block text-sm font-medium">
              Notat (valgfritt)
              <textarea name="note" className="brand-input mt-1 min-h-20 resize-y" maxLength={2000} defaultValue={fdvHandover?.note ?? ""} />
            </label>
            <button type="submit" className="brand-button w-full">
              Lagre signering
            </button>
            {fdvHandover ? (
              <p className="text-xs text-brand-ink/70">
                Sist oppdatert {formatDateTime(fdvHandover.updatedAt)} av {fdvHandover.createdBy.name}.
              </p>
            ) : null}
          </form>
        </div>

        <div className="space-y-4">
          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Automatisk samlet: sjekklister</h2>
            {checklistSummary.length === 0 ? (
              <p className="mt-2 text-sm text-brand-ink/75">Ingen sjekklister pa prosjektet enda.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-brand-canvas text-xs uppercase tracking-wider text-brand-ink/70">
                    <tr>
                      <th className="px-2 py-2">Sjekkliste</th>
                      <th className="px-2 py-2">Besvart</th>
                      <th className="px-2 py-2">Bilder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklistSummary.map((row) => (
                      <tr key={row.id} className="border-t border-black/10">
                        <td className="px-2 py-2 font-medium">{row.navn}</td>
                        <td className="px-2 py-2">
                          {row.answeredItems}/{row.totalItems}
                        </td>
                        <td className="px-2 py-2">{row.imageCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Produktdokumentasjon</h2>
            {productDocuments.length === 0 ? (
              <p className="mt-2 text-sm text-brand-ink/75">Ingen produktdokumenter lastet opp enda.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {productDocuments.map((doc) => (
                  <div key={doc.id} className="rounded-xl border border-black/10 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{doc.tittel}</p>
                        <p className="text-xs text-brand-ink/70">
                          Lastet opp av {doc.createdBy.name} - {formatDateTime(doc.createdAt)}
                        </p>
                        {doc.notat ? <p className="mt-1 text-xs text-brand-ink/75">{doc.notat}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a href={doc.filUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-canvas px-2.5 py-1.5 text-xs font-semibold hover:bg-brand-canvas/80">
                          Apne
                        </a>
                        <form action={deleteProjectProductDocumentAction}>
                          <input type="hidden" name="documentId" value={doc.id} />
                          <input type="hidden" name="projectId" value={project.id} />
                          <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700">
                            Slett
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Automatisk samlet: bilder</h2>
            {imageEntries.length === 0 ? (
              <p className="mt-2 text-sm text-brand-ink/75">Ingen bilder funnet i sjekklister/avvik enda.</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                {imageEntries.slice(0, 24).map((image) => (
                  <a key={image.id} href={image.filUrl} target="_blank" rel="noreferrer" className="group rounded-lg border border-black/10 bg-brand-canvas p-1">
                    <img src={image.filUrl} alt={image.source} className="h-28 w-full rounded object-cover" />
                    <p className="mt-1 truncate text-[11px] text-brand-ink/75 group-hover:text-brand-ink">{image.source}</p>
                  </a>
                ))}
              </div>
            )}
            {imageEntries.length > 24 ? <p className="mt-2 text-xs text-brand-ink/70">Viser 24 av {imageEntries.length} bilder i forhandsvisning.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
