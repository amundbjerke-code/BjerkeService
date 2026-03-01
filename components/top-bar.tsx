import Link from "next/link";

import { signOutAction } from "@/app/actions/auth-actions";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/logo";

export async function TopBar() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white/90 backdrop-blur">
      <div className="brand-container flex h-16 items-center justify-between gap-3">
        <Logo compact />

        {session?.user ? (
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-ink transition hover:bg-brand-canvas"
            >
              Dashboard
            </Link>
            {session.user.role === "ADMIN" ? (
              <Link
                href="/admin/users"
                className="rounded-lg px-3 py-2 text-sm font-medium text-brand-ink transition hover:bg-brand-canvas"
              >
                Brukere
              </Link>
            ) : null}
            <form action={signOutAction}>
              <button type="submit" className="brand-button px-3 py-2 text-sm">
                Logg ut
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="brand-button px-3 py-2 text-sm">
            Logg inn
          </Link>
        )}
      </div>
    </header>
  );
}


