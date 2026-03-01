type ModulePlaceholderProps = {
  title: string;
  subtitle?: string;
};

export function ModulePlaceholder({ title, subtitle }: ModulePlaceholderProps) {
  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <h1 className="text-xl font-bold text-brand-ink">{title}</h1>
        <p className="mt-2 text-sm text-brand-ink/80">{subtitle ?? "Denne modulen kommer i neste bolge."}</p>
      </div>

      <div className="brand-card p-5">
        <p className="text-sm text-brand-ink/75">Placeholder side klar for videre implementering.</p>
      </div>
    </section>
  );
}
