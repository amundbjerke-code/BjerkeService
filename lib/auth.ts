import { PrismaAdapter } from "@auth/prisma-adapter";
import { Role } from "@prisma/client";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt"
  },
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: "/login"
  },
  providers: [
    Credentials({
      name: "E-post og passord",
      credentials: {
        email: { label: "E-post", type: "email" },
        password: { label: "Passord", type: "password" }
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;
        const user = await db.user.findUnique({
          where: { email }
        });

        if (!user) {
          return null;
        }

        const isValidPassword = await verifyPassword(password, user.passwordHash);
        if (!isValidPassword) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        };
      }
    })
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        token.role = user.role ?? Role.EMPLOYEE;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = typeof token.sub === "string" ? token.sub : "";
        session.user.role = (token.role as Role | undefined) ?? Role.EMPLOYEE;
      }
      return session;
    }
  },
  events: {
    signIn: async ({ user }) => {
      await logAudit({
        actorId: user.id,
        action: "AUTH_SIGN_IN",
        entityType: "USER",
        entityId: user.id,
        metadata: { provider: "credentials" }
      });
    }
  }
});



