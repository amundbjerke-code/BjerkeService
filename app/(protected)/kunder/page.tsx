import { CustomerStatus, Prisma } from "@prisma/client";
import Link from "next/link";

import { createCustomerAction } from "@/app/actions/customer-actions";
import { db } from "@/lib/db";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStatusFilter(rawValue: string): "ALL" | CustomerStatus {
  if (rawValue === CustomerStatus.ACTIVE || rawValue === CustomerStatus.INACTIVE) {
    return rawValue;
  }
  return "ALL";
}

function getSuccessMessage(success: string): string | null {
  if (success === "deactivated") return "Kunden er deaktivert.";
  if (success === "activated") return "Kunden er aktiv igjen.";
  return null;
}

export default async function KunderPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const query = toSingleValue(params.q);
  const statusFilter = getStatusFilter(toSingleValue(params.status).toUpperCase());
  const error = toSingleValue(params.error);
  const success = getSuccessMessage(toSingleValue(params.success));

  const where: Prisma.CustomerWhereInput = {};

  if (statusFilter !== "ALL") {
    where.status = statusFilter;
  }

  if (query.length > 0) {
    where.OR = [
      { navn: { contains: query, mode: "insensitive" } },
      { telefon: { contains: query, mode: "insensitive" } },
      { epost: { contains: query, mode: "insensitive" } }
    ];
  }

  const customers = await db.customer.findMany({
    where,
    orderBy: [{ status: "asc" }, { navn: "asc" }],
    select: {
      id: true,
      navn: true,
      telefon: true,
      epost: true,
      poststed: true,
      status: true
    }
  });

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <h1 className="text-xl font-bold text-brand-ink">Kunder</h1>
        <p className="mt-2 text-sm text-brand-ink/80">Opprett, finn og vedlikehold kunder fra mobil eller desktop.</p>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form action={createCustomerAction} className="brand-card space-y-3 p-4">
          <h2 className="text-lg font-semibold">Ny kunde</h2>
          <label className="block text-sm font-medium">
            Navn
            <input name="navn" className="brand-input mt-1" required minLength={2} maxLength={120} />
          </label>
          <label className="block text-sm font-medium">
            Org.nr (valgfritt)
            <input name="orgnr" className="brand-input mt-1" maxLength={30} />
          </label>
          <label className="block text-sm font-medium">
            E-post
            <input name="epost" type="email" className="brand-input mt-1" required maxLength={200} />
          </label>
          <label className="block text-sm font-medium">
            Telefon
            <input name="telefon" className="brand-input mt-1" required minLength={5} maxLength={40} />
          </label>
          <label className="block text-sm font-medium">
            Adresse
            <input name="adresse" className="brand-input mt-1" required minLength={2} maxLength={200} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              Postnr
              <input name="postnr" className="brand-input mt-1" required minLength={2} maxLength={12} />
            </label>
            <label className="block text-sm font-medium">
              Poststed
              <input name="poststed" className="brand-input mt-1" required minLength={2} maxLength={120} />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Notater (valgfritt)
            <textarea name="notater" className="brand-input mt-1 min-h-24 resize-y" maxLength={4000} />
          </label>

          <button type="submit" className="brand-button w-full">
            Opprett kunde
          </button>
        </form>

        <div className="space-y-3">
          <form className="brand-card grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_180px_auto]">
            <label className="block text-sm font-medium">
              Hurtigsok (navn, telefon, e-post)
              <input
                name="q"
                defaultValue={query}
                className="brand-input mt-1"
                placeholder="Skriv navn, telefon eller e-post"
              />
            </label>
            <label className="block text-sm font-medium">
              Status
              <select name="status" defaultValue={statusFilter} className="brand-input mt-1">
                <option value="ALL">Alle</option>
                <option value={CustomerStatus.ACTIVE}>Aktive</option>
                <option value={CustomerStatus.INACTIVE}>Inaktive</option>
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" className="brand-button w-full md:w-auto">
                Sok
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {customers.length === 0 ? (
              <div className="brand-card p-4 text-sm text-brand-ink/75">Ingen kunder matcher filtreringen.</div>
            ) : (
              customers.map((customer) => (
                <Link
                  key={customer.id}
                  href={`/kunder/${customer.id}`}
                  className="brand-card block p-4 transition hover:border-brand-red/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-brand-ink">{customer.navn}</p>
                      <p className="mt-1 text-sm text-brand-ink/75">{customer.poststed}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        customer.status === CustomerStatus.ACTIVE ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {customer.status === CustomerStatus.ACTIVE ? "Aktiv" : "Inaktiv"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-brand-ink/80">{customer.telefon}</p>
                  <p className="text-sm text-brand-ink/80">{customer.epost}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
