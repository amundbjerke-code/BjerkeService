import { Role } from "@prisma/client";
import Link from "next/link";

import {
  createChecklistTemplateAction,
  deleteChecklistTemplateAction,
  updateChecklistTemplateAction
} from "@/app/actions/checklist-actions";
import { db } from "@/lib/db";
import { requireRolePage } from "@/lib/rbac";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSuccessMessage(value: string): string | null {
  if (value === "created") return "Mal ble opprettet.";
  if (value === "updated") return "Mal ble oppdatert.";
  if (value === "deleted") return "Mal ble slettet.";
  return null;
}

export default async function ChecklistTemplatesPage({ searchParams }: Props) {
  await requireRolePage(Role.ADMIN);
  const params = (await searchParams) ?? {};

  const error = toSingleValue(params.error);
  const success = getSuccessMessage(toSingleValue(params.success));

  const templates = await db.checklistTemplate.findMany({
    orderBy: [{ kategori: "asc" }, { navn: "asc" }],
    include: {
      items: {
        orderBy: { rekkefolge: "asc" }
      }
    }
  });

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">Sjekklistemaler</h1>
            <p className="mt-2 text-sm text-brand-ink/80">Kun admin kan administrere maler. Ett punkt per linje.</p>
          </div>
          <Link href="/sjekklister" className="rounded-lg px-3 py-2 text-sm font-medium text-brand-ink hover:bg-brand-canvas">
            Til oversikt
          </Link>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <form action={createChecklistTemplateAction} className="brand-card space-y-3 p-4">
        <h2 className="text-lg font-semibold">Ny mal</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-sm font-medium">
            Navn
            <input name="navn" className="brand-input mt-1" required minLength={2} maxLength={150} />
          </label>
          <label className="block text-sm font-medium">
            Kategori
            <input name="kategori" className="brand-input mt-1" required minLength={2} maxLength={120} />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Punkter (ett per linje)
          <textarea name="punkter" className="brand-input mt-1 min-h-40 resize-y" required />
        </label>
        <button type="submit" className="brand-button">
          Opprett mal
        </button>
      </form>

      <div className="space-y-3">
        {templates.length === 0 ? (
          <div className="brand-card p-4 text-sm text-brand-ink/75">Ingen maler registrert enna.</div>
        ) : (
          templates.map((template) => (
            <div key={template.id} className="brand-card p-4">
              <form action={updateChecklistTemplateAction} className="space-y-3">
                <input type="hidden" name="templateId" value={template.id} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Navn
                    <input name="navn" defaultValue={template.navn} className="brand-input mt-1" required minLength={2} maxLength={150} />
                  </label>
                  <label className="block text-sm font-medium">
                    Kategori
                    <input
                      name="kategori"
                      defaultValue={template.kategori}
                      className="brand-input mt-1"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  Punkter (ett per linje)
                  <textarea
                    name="punkter"
                    defaultValue={template.items.map((item) => item.tekst).join("\n")}
                    className="brand-input mt-1 min-h-32 resize-y"
                    required
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="brand-button px-3 py-2 text-sm">
                    Lagre mal
                  </button>
                </div>
              </form>
              <form action={deleteChecklistTemplateAction} className="mt-2">
                <input type="hidden" name="templateId" value={template.id} />
                <button type="submit" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  Slett mal
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
