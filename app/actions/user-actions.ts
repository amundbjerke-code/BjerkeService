"use server";

import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireRolePage } from "@/lib/rbac";

const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.nativeEnum(Role)
});

export async function createUserAction(formData: FormData): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role")
  });

  if (!parsed.success) {
    redirect("/admin/users?error=Ugyldige%20felt");
  }

  const { name, email, password, role } = parsed.data;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/admin/users?error=E-post%20finnes%20allerede");
  }

  const created = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role
    }
  });

  await logAudit({
    actorId: session.user.id,
    action: "USER_CREATED",
    entityType: "USER",
    entityId: created.id,
    metadata: { email: created.email, role: created.role }
  });

  redirect("/admin/users?success=1");
}



