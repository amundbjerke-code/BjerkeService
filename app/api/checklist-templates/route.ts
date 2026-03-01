import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi, requireRoleApi } from "@/lib/rbac";

const createTemplateSchema = z.object({
  navn: z.string().trim().min(2).max(150),
  kategori: z.string().trim().min(2).max(120),
  items: z.array(z.string().trim().min(1).max(500)).min(1).max(200)
});

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function GET() {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const templates = await db.checklistTemplate.findMany({
    orderBy: [{ kategori: "asc" }, { navn: "asc" }],
    include: {
      items: {
        orderBy: { rekkefolge: "asc" }
      }
    }
  });

  return NextResponse.json({ data: templates });
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
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const template = await db.checklistTemplate.create({
    data: {
      navn: parsed.data.navn,
      kategori: parsed.data.kategori,
      items: {
        create: parsed.data.items.map((tekst, index) => ({
          tekst,
          rekkefolge: index + 1
        }))
      }
    },
    include: {
      items: {
        orderBy: { rekkefolge: "asc" }
      }
    }
  });

  await logAudit({
    actorId: session.user.id,
    action: "CHECKLIST_TEMPLATE_CREATED",
    entityType: "CHECKLIST_TEMPLATE",
    entityId: template.id,
    ipAddress: getRequestIp(request),
    metadata: { navn: template.navn, kategori: template.kategori, itemCount: template.items.length }
  });

  return NextResponse.json({ data: template }, { status: 201 });
}
