import { requireAuthPage } from "@/lib/rbac";

export default async function ProtectedLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  await requireAuthPage();

  return <div className="brand-container">{children}</div>;
}


