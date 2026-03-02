"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type UserRole = "ADMIN" | "EMPLOYEE";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
};

const baseItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Hjem" },
  { href: "/kunder", label: "Kunder", shortLabel: "Kunder" },
  { href: "/prosjekter", label: "Prosjekter", shortLabel: "Prosj." },
  { href: "/tilbud", label: "Tilbud", shortLabel: "Tilbud" },
  { href: "/sjekklister", label: "Sjekklister", shortLabel: "Sjekk" },
  { href: "/timer", label: "Timer", shortLabel: "Timer" },
  { href: "/rapport", label: "Rapport", shortLabel: "Rapport" }
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navClassName(active: boolean, compact = false): string {
  const base = compact
    ? "flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition"
    : "block rounded-lg px-3 py-2 text-sm font-medium transition";

  if (active) {
    return `${base} bg-brand-red text-white`;
  }
  return `${base} text-brand-ink hover:bg-brand-canvas`;
}

export function AppNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const desktopItems = role === "ADMIN" ? [...baseItems, { href: "/admin/users", label: "Brukere", shortLabel: "Admin" }] : baseItems;
  const mobileItems = baseItems;

  return (
    <>
      <aside className="hidden md:block">
        <nav className="brand-card sticky top-24 p-3" aria-label="Hovednavigasjon">
          <ul className="space-y-1">
            {desktopItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} className={navClassName(active)}>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur md:hidden"
        aria-label="Mobilnavigasjon"
      >
        <div
          className="mx-auto grid w-full max-w-screen-sm"
          style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
        >
          {mobileItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={navClassName(active, true)}>
                <span>{item.shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
