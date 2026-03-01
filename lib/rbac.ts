import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export async function requireAuthPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session;
}

export async function requireRolePage(role: Role) {
  const session = await requireAuthPage();
  if (session.user.role !== role) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireAuthApi() {
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, response: null };
}

export async function requireRoleApi(role: Role) {
  const { session, response } = await requireAuthApi();
  if (response || !session) {
    return { session: null, response };
  }
  if (session.user.role !== role) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, response: null };
}



