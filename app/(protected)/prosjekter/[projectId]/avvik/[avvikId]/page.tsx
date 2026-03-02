import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteAvvikAction, updateAvvikAction } from "@/app/actions/avvik-actions";
import { AvvikImageUpload } from "@/components/avvik-image-upload";
import {
  avvikAlvorlighetsgradOptions,
  avvikStatusOptions,
  getAvvikAlvorlighetsgradColor,
  getAvvikAlvorlighetsgradLabel,
  getAvvikStatusColor,
  getAvvikStatusLabel
} from "@/lib/avvik-meta";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

type Props = {
  params: Promise<{ projectId: string; avvikId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSuccessMessage(success: string): string | null {
  if (success === "updated") return "Avviket ble oppdatert.";
  return null;
}

export default async function AvvikDetailPage({ params, searchParams }: Props) {
  await requireAuthPage();
  const { projectId, avvikId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};

  const error = toSingleValue(resolvedSearchParams.error);
  const success = getSuccessMessage(toSingleValue(resolvedSearchParams.success));

  const avvik = await db.avvik.findUnique({
    where: { id: avvikId },
    include: {
      project: { select: { id: true, navn: true } },
      registrertAv: { select: { id: true, name: true } },
      lukketAv: { select: { id: true, name: true } },
      attachments: { orderBy: { createdAt: "desc" } }
    }
  });

  if (!avvik || avvik.projectId !== projectId) {
    notFound();
  }

  const serializedAttachments = avvik.attachments.map((a) => ({
    id: a.id,
    filUrl: a.filUrl,
    filType: a.filType
  }));

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <Link
          href={`/prosjekter/${projectId}#avvik`}
          className="text-sm text-brand-ink/75 hover:underline"
        >
          &larr; Til prosjekt: {avvik.project.navn}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-brand-ink">{avvik.tittel}</h1>
          <div className="flex gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getAvvikAlvorlighetsgradColor(avvik.alvorlighetsgrad)}`}>
              {getAvvikAlvorlighetsgradLabel(avvik.alvorlighetsgrad)}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getAvvikStatusColor(avvik.status)}`}>
              {getAvvikStatusLabel(avvik.status)}
            </span>
          </div>
        </div>
        <p className="mt-1 text-sm text-brand-ink/75">
          Registrert av {avvik.registrertAv.name} - {avvik.createdAt.toLocaleDateString("nb-NO")}
        </p>
        {avvik.lukketAv ? (
          <p className="text-sm text-brand-ink/75">
            Lukket av {avvik.lukketAv.name} - {avvik.lukketDato?.toLocaleDateString("nb-NO")}
          </p>
        ) : null}
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form action={updateAvvikAction} className="brand-card space-y-3 p-4">
          <input type="hidden" name="avvikId" value={avvik.id} />
          <input type="hidden" name="projectId" value={projectId} />

          <h2 className="text-lg font-semibold">Rediger avvik</h2>

          <label className="block text-sm font-medium">
            Tittel
            <input
              name="tittel"
              defaultValue={avvik.tittel}
              className="brand-input mt-1"
              required
              minLength={2}
              maxLength={200}
            />
          </label>

          <label className="block text-sm font-medium">
            Beskrivelse
            <textarea
              name="beskrivelse"
              defaultValue={avvik.beskrivelse}
              className="brand-input mt-1 min-h-24 resize-y"
              required
              minLength={2}
              maxLength={4000}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Alvorlighetsgrad
              <select name="alvorlighetsgrad" className="brand-input mt-1" defaultValue={avvik.alvorlighetsgrad}>
                {avvikAlvorlighetsgradOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Status
              <select name="status" className="brand-input mt-1" defaultValue={avvik.status}>
                {avvikStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium">
            Tiltak (korrigerende handling)
            <textarea
              name="tiltak"
              defaultValue={avvik.tiltak ?? ""}
              className="brand-input mt-1 min-h-24 resize-y"
              maxLength={4000}
              placeholder="Beskriv korrigerende tiltak..."
            />
          </label>

          <button type="submit" className="brand-button w-full">
            Lagre endringer
          </button>
        </form>

        <div className="space-y-4">
          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Bilder</h2>
            <div className="mt-3">
              <AvvikImageUpload avvikId={avvik.id} initialAttachments={serializedAttachments} />
            </div>
          </div>

          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Slett avvik</h2>
            <p className="mt-2 text-sm text-brand-ink/75">Sletting fjerner avviket og alle vedlegg permanent.</p>
            <form action={deleteAvvikAction} className="mt-3">
              <input type="hidden" name="avvikId" value={avvik.id} />
              <input type="hidden" name="projectId" value={projectId} />
              <button
                type="submit"
                className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
              >
                Slett avvik
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
