import { Role } from "@prisma/client";

import { createUserAction } from "@/app/actions/user-actions";
import { db } from "@/lib/db";
import { requireRolePage } from "@/lib/rbac";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminUsersPage({ searchParams }: Props) {
  await requireRolePage(Role.ADMIN);
  const resolvedParams = (await searchParams) ?? {};

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true
    }
  });

  const error = typeof resolvedParams.error === "string" ? resolvedParams.error : null;
  const success = typeof resolvedParams.success === "string" ? resolvedParams.success : null;

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <h1 className="text-xl font-bold">Brukeradministrasjon</h1>
        <p className="mt-1 text-sm text-brand-ink/80">Kun admin kan opprette ansatte i MVP v1.</p>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">Bruker opprettet.</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form action={createUserAction} className="brand-card space-y-3 p-4">
          <h2 className="text-lg font-semibold">Ny bruker</h2>
          <label className="block text-sm font-medium">
            Navn
            <input name="name" className="brand-input mt-1" required minLength={2} />
          </label>
          <label className="block text-sm font-medium">
            E-post
            <input name="email" type="email" className="brand-input mt-1" required />
          </label>
          <label className="block text-sm font-medium">
            Midlertidig passord
            <input name="password" type="password" className="brand-input mt-1" required minLength={8} />
          </label>
          <label className="block text-sm font-medium">
            Rolle
            <select name="role" className="brand-input mt-1" defaultValue="EMPLOYEE">
              <option value="EMPLOYEE">Ansatt</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <button type="submit" className="brand-button w-full">
            Opprett bruker
          </button>
        </form>

        <div className="brand-card overflow-hidden">
          <div className="border-b border-black/5 p-4">
            <h2 className="text-lg font-semibold">Eksisterende brukere</h2>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-canvas text-xs uppercase tracking-wider text-brand-ink/70">
                <tr>
                  <th className="px-4 py-3">Navn</th>
                  <th className="px-4 py-3">Rolle</th>
                  <th className="px-4 py-3">Opprettet</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-black/5">
                    <td className="px-4 py-3">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-brand-ink/70">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">{user.role}</td>
                    <td className="px-4 py-3">{user.createdAt.toLocaleDateString("nb-NO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}


