import Image from "next/image";
import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center" aria-label="Bjerke Service">
      <Image src="/bjerke-logo.svg" alt="Bjerke Service" width={compact ? 112 : 190} height={compact ? 62 : 106} priority />
    </Link>
  );
}


