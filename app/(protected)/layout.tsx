import { requireAuthPage } from "@/lib/rbac";
import { AppNav } from "@/components/app-nav";

export default async function ProtectedLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAuthPage();

  return (
    <div className="brand-container">
      <div className="grid grid-cols-1 gap-4 pb-24 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 md:pb-0">
        <AppNav role={session.user.role} />
        <div>{children}</div>
      </div>
    </div>
  );
}


