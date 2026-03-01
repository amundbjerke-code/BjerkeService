import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  projectId: z.string().cuid()
});

const createChecklistSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("template"),
    templateId: z.string().cuid(),
    navn: z
      .string()
      .trim()
      .max(150)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null))
  }),
  z.object({
    mode: z.literal("scratch"),
    navn: z.string().trim().min(2).max(150),
    items: z.array(z.string().trim().min(1).max(500)).min(1).max(300)
  })
]);

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig prosjekt-id" }, { status: 400 });
  }

  const checklists = await db.projectChecklist.findMany({
    where: { projectId: parsedParams.data.projectId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      items: {
        orderBy: { rekkefolge: "asc" },
        select: {
          id: true,
          svar: true
        }
      }
    }
  });

  return NextResponse.json({ data: checklists });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { session, response } = await requireAuthApi();
  if (response) {
    return response;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig prosjekt-id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = createChecklistSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig payload", issues: parsedBody.error.flatten() }, { status: 400 });
  }

  const project = await db.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { id: true }
  });
  if (!project) {
    return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
  }

  let checklist;
  if (parsedBody.data.mode === "template") {
    const template = await db.checklistTemplate.findUnique({
      where: { id: parsedBody.data.templateId },
      include: {
        items: {
          orderBy: { rekkefolge: "asc" }
        }
      }
    });
    if (!template || template.items.length === 0) {
      return NextResponse.json({ error: "Mal ikke funnet" }, { status: 404 });
    }

    checklist = await db.projectChecklist.create({
      data: {
        projectId: parsedParams.data.projectId,
        createdById: session.user.id,
        navn: parsedBody.data.navn ?? template.navn,
        items: {
          create: template.items.map((item) => ({
            tekst: item.tekst,
            rekkefolge: item.rekkefolge
          }))
        }
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_CHECKLIST_CREATED_FROM_TEMPLATE",
      entityType: "PROJECT_CHECKLIST",
      entityId: checklist.id,
      ipAddress: getRequestIp(request),
      metadata: { projectId: parsedParams.data.projectId, templateId: template.id, checklistNavn: checklist.navn }
    });
  } else {
    checklist = await db.projectChecklist.create({
      data: {
        projectId: parsedParams.data.projectId,
        createdById: session.user.id,
        navn: parsedBody.data.navn,
        items: {
          create: parsedBody.data.items.map((tekst, index) => ({
            tekst,
            rekkefolge: index + 1
          }))
        }
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "PROJECT_CHECKLIST_CREATED_FROM_SCRATCH",
      entityType: "PROJECT_CHECKLIST",
      entityId: checklist.id,
      ipAddress: getRequestIp(request),
      metadata: { projectId: parsedParams.data.projectId, checklistNavn: checklist.navn, itemCount: parsedBody.data.items.length }
    });
  }

  return NextResponse.json({ data: checklist }, { status: 201 });
}
