import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectChecklistEditor } from "@/components/project-checklist-editor";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

type Props = {
  params: Promise<{ projectId: string; checklistId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSuccessMessage(value: string): string | null {
  if (value === "created") {
    return "Sjekklisten ble opprettet.";
  }
  return null;
}

export default async function ProjectChecklistDetailPage({ params, searchParams }: Props) {
  await requireAuthPage();
  const { projectId, checklistId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};

  const error = toSingleValue(resolvedSearchParams.error);
  const success = getSuccessMessage(toSingleValue(resolvedSearchParams.success));

  const checklist = await db.projectChecklist.findFirst({
    where: {
      id: checklistId,
      projectId
    },
    include: {
      project: {
        select: {
          id: true,
          navn: true
        }
      },
      createdBy: {
        select: {
          id: true,
          name: true
        }
      },
      items: {
        orderBy: { rekkefolge: "asc" },
        include: {
          attachments: {
            orderBy: { createdAt: "desc" }
          }
        }
      }
    }
  });

  if (!checklist) {
    notFound();
  }

  const editorItems = checklist.items.map((item) => ({
    id: item.id,
    tekst: item.tekst,
    rekkefolge: item.rekkefolge,
    svar: item.svar,
    kommentar: item.kommentar,
    attachments: item.attachments.map((attachment) => ({
      id: attachment.id,
      filUrl: attachment.filUrl,
      filType: attachment.filType,
      createdAt: attachment.createdAt.toISOString()
    }))
  }));

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">{checklist.navn}</h1>
            <p className="mt-1 text-sm text-brand-ink/80">Prosjekt: {checklist.project.navn}</p>
            <p className="text-sm text-brand-ink/70">Opprettet av {checklist.createdBy.name}</p>
          </div>
          <Link href={`/prosjekter/${checklist.project.id}#sjekklister`} className="rounded-lg px-3 py-2 text-sm font-medium text-brand-ink hover:bg-brand-canvas">
            Til prosjekt
          </Link>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <ProjectChecklistEditor checklistId={checklist.id} items={editorItems} />
    </section>
  );
}
