import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireRoleApi } from "@/lib/rbac";

const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.nativeEnum(Role).default(Role.EMPLOYEE)
});

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function GET() {
  const { response } = await requireRoleApi(Role.ADMIN);
  if (response) {
    return response;
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ data: users });
}

export async function POST(request: Request) {
  const { session, response } = await requireRoleApi(Role.ADMIN);
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { name, email, password, role } = parsed.data;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "E-post er allerede i bruk" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const created = await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      role
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true
    }
  });

  await logAudit({
    actorId: session.user.id,
    action: "USER_CREATED",
    entityType: "USER",
    entityId: created.id,
    ipAddress: getRequestIp(request),
    metadata: { role: created.role, email: created.email }
  });

  return NextResponse.json({ data: created }, { status: 201 });
}


