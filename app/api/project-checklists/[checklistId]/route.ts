import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAuthApi } from "@/lib/rbac";

const paramsSchema = z.object({
  checklistId: z.string().cuid()
});

export async function GET(request: Request, context: { params: Promise<{ checklistId: string }> }) {
  const { response } = await requireAuthApi();
  if (response) {
    return response;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig sjekkliste-id" }, { status: 400 });
  }

  const checklist = await db.projectChecklist.findUnique({
    where: { id: parsedParams.data.checklistId },
    include: {
      project: {
        select: {
          id: true,
          navn: true
        }
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      items: {
        orderBy: { rekkefolge: "asc" },
        include: {
          attachments: {
            orderBy: { createdAt: "desc" }
          }
        }
      }
    }
  });
  if (!checklist) {
    return NextResponse.json({ error: "Sjekkliste ikke funnet" }, { status: 404 });
  }

  return NextResponse.json({ data: checklist });
}
