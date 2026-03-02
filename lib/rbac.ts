import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { Session } from "next-auth";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function resolveSessionUser(session: Session | null): Promise<Session | null> {
  if (!session?.user) {
    return null;
  }

  let user: { id: string; role: Role } | null = null;

  if (typeof session.user.id === "string" && session.user.id.length > 0) {
    user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true }
    });
  }

  if (!user && typeof session.user.email === "string" && session.user.email.length > 0) {
    user = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });
  }

  if (!user) {
    return null;
  }

  session.user.id = user.id;
  session.user.role = user.role;
  return session;
}

export async function requireAuthPage() {
  const resolvedSession = await resolveSessionUser(await auth());
  if (!resolvedSession) {
    redirect("/login");
  }
  return resolvedSession;
}

export async function requireRolePage(role: Role) {
  const session = await requireAuthPage();
  if (session.user.role !== role) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireAuthApi() {
  const resolvedSession = await resolveSessionUser(await auth());
  if (!resolvedSession) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session: resolvedSession, response: null };
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



