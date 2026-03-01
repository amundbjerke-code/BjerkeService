"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { auth, signIn, signOut } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function signInAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    redirect("/login?error=Ugyldig%20innlogging");
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard"
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=Feil%20e-post%20eller%20passord");
    }
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  const session = await auth();
  if (session?.user?.id) {
    await logAudit({
      actorId: session.user.id,
      action: "AUTH_SIGN_OUT",
      entityType: "USER",
      entityId: session.user.id
    });
  }
  await signOut({ redirectTo: "/login" });
}



