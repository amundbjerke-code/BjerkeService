import Image from "next/image";
import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="Bjerke Service">
      <Image src="/bjerke-logo.svg" alt="Bjerke Service" width={compact ? 110 : 160} height={compact ? 50 : 72} priority />
      {!compact ? (
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-red">
          Prosjektstyring
        </span>
      ) : null}
    </Link>
  );
}


