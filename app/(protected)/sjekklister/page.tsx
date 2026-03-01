import { Role } from "@prisma/client";
import Link from "next/link";

import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";

export default async function SjekklisterPage() {
  const session = await requireAuthPage();

  const checklists = await db.projectChecklist.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
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
        select: {
          id: true,
          svar: true
        }
      }
    }
  });

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-ink">Sjekklister</h1>
            <p className="mt-2 text-sm text-brand-ink/80">
              Oversikt over sjekklister pa tvers av prosjekter. Opprett nye sjekklister fra prosjektsiden.
            </p>
          </div>
          {session.user.role === Role.ADMIN ? (
            <Link href="/sjekklister/maler" className="brand-button px-3 py-2 text-sm">
              Administrer maler
            </Link>
          ) : null}
        </div>
      </div>

      {checklists.length === 0 ? (
        <div className="brand-card p-4 text-sm text-brand-ink/75">Ingen sjekklister opprettet enna.</div>
      ) : (
        <div className="space-y-3">
          {checklists.map((checklist) => {
            const answered = checklist.items.filter((item) => item.svar !== null).length;
            const total = checklist.items.length;

            return (
              <Link
                key={checklist.id}
                href={`/prosjekter/${checklist.project.id}/sjekklister/${checklist.id}`}
                className="brand-card block p-4 transition hover:border-brand-red/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-brand-ink">{checklist.navn}</p>
                    <p className="mt-1 text-sm text-brand-ink/75">
                      Prosjekt: {checklist.project.navn} - Opprettet av: {checklist.createdBy.name}
                    </p>
                  </div>
                  <span className="rounded-full bg-brand-canvas px-2.5 py-1 text-xs font-semibold">
                    {answered}/{total} besvart
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
