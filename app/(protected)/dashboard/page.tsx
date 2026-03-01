export default function DashboardPage() {
  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <h1 className="text-xl font-bold text-brand-ink">Bjerke Service Dashboard</h1>
        <p className="mt-2 text-sm text-brand-ink/80">
          Bølge 1 er aktivert: innlogging, roller, audit-spor og grunnstruktur for videre moduler.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="brand-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-red">Auth</p>
          <h2 className="mt-1 text-lg font-semibold">Rollebasert tilgang</h2>
          <p className="mt-2 text-sm text-brand-ink/80">Admin og ansatt styres i session og API-guards.</p>
        </article>

        <article className="brand-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-red">Audit</p>
          <h2 className="mt-1 text-lg font-semibold">Revisjonsspor</h2>
          <p className="mt-2 text-sm text-brand-ink/80">Innlogging og brukeropprettelser logges med tidspunkt og aktør.</p>
        </article>

        <article className="brand-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-red">API</p>
          <h2 className="mt-1 text-lg font-semibold">Klar for neste bølge</h2>
          <p className="mt-2 text-sm text-brand-ink/80">Kundemodell og prosjekter kan bygges direkte på denne basen.</p>
        </article>
      </div>
    </section>
  );
}


