import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { requireRoleApi } from "@/lib/rbac";

export async function GET(request: Request) {
  const { session, response } = await requireRoleApi(Role.ADMIN);
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Number.isNaN(limit) ? 50 : limit,
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      }
    }
  });

  return NextResponse.json({ data: logs });
}


