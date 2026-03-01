"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/rbac";
import { formatDateInput, get14DayPeriodFromDate } from "@/lib/time-period";

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const createTimeEntrySchema = z.object({
  projectId: z.string().cuid(),
  dato: dateStringSchema,
  timer: z.number().gt(0).max(24),
  beskrivelse: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  belopEksMva: z.number().min(0).nullable(),
  fakturerbar: z.boolean(),
  returnTo: z
    .enum(["project", "timer"])
    .optional()
    .default("project"),
  periodStart: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const deleteTimeEntrySchema = z.object({
  timeEntryId: z.string().cuid(),
  projectId: z.string().cuid(),
  periodStart: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return Number(parsed.toFixed(2));
}

function parseTimer(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") {
    return Number.NaN;
  }
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return Number(parsed.toFixed(2));
}

function normalizePeriodStart(periodStart: string | null, fallbackDate: Date): string {
  if (periodStart && /^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
    return periodStart;
  }
  return formatDateInput(get14DayPeriodFromDate(fallbackDate).start);
}

export async function createTimeEntryAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = createTimeEntrySchema.safeParse({
    projectId: formData.get("projectId"),
    dato: formData.get("dato"),
    timer: parseTimer(formData.get("timer")),
    beskrivelse: formData.get("beskrivelse"),
    belopEksMva: parseOptionalNumber(formData.get("belopEksMva")),
    fakturerbar: formData.get("fakturerbar") === "on",
    returnTo: formData.get("returnTo"),
    periodStart: formData.get("periodStart")
  });

  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldig%20timeregistrering");
  }

  const project = await db.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, timeprisEksMva: true, navn: true }
  });
  if (!project) {
    redirect("/prosjekter?error=Prosjekt%20ikke%20funnet");
  }

  const entryDate = new Date(`${parsed.data.dato}T00:00:00`);
  const calculatedBelop = Number(((project.timeprisEksMva ?? 0) * parsed.data.timer).toFixed(2));
  const belopEksMva = parsed.data.belopEksMva ?? calculatedBelop;

  const created = await db.timeEntry.create({
    data: {
      projectId: project.id,
      userId: session.user.id,
      dato: entryDate,
      timer: parsed.data.timer,
      beskrivelse: parsed.data.beskrivelse,
      belopEksMva,
      fakturerbar: parsed.data.fakturerbar
    }
  });

  await logAudit({
    actorId: session.user.id,
    action: "TIME_ENTRY_CREATED",
    entityType: "TIME_ENTRY",
    entityId: created.id,
    metadata: {
      projectId: project.id,
      timer: created.timer,
      belopEksMva: created.belopEksMva,
      fakturerbar: created.fakturerbar
    }
  });

  const periodStart = normalizePeriodStart(parsed.data.periodStart, entryDate);
  if (parsed.data.returnTo === "timer") {
    redirect(`/timer?periodStart=${periodStart}&success=time-created`);
  }
  redirect(`/prosjekter/${project.id}?periodStart=${periodStart}&success=time-created#timer`);
}

export async function deleteTimeEntryAction(formData: FormData): Promise<void> {
  const session = await requireAuthPage();
  const parsed = deleteTimeEntrySchema.safeParse({
    timeEntryId: formData.get("timeEntryId"),
    projectId: formData.get("projectId"),
    periodStart: formData.get("periodStart")
  });
  if (!parsed.success) {
    redirect("/prosjekter?error=Ugyldig%20timeregistrering");
  }

  const existing = await db.timeEntry.findUnique({
    where: { id: parsed.data.timeEntryId },
    select: { id: true, projectId: true }
  });
  if (!existing || existing.projectId !== parsed.data.projectId) {
    redirect(`/prosjekter/${parsed.data.projectId}?error=Timeregistrering%20ikke%20funnet#timer`);
  }

  await db.timeEntry.delete({
    where: { id: existing.id }
  });

  await logAudit({
    actorId: session.user.id,
    action: "TIME_ENTRY_DELETED",
    entityType: "TIME_ENTRY",
    entityId: existing.id,
    metadata: { projectId: existing.projectId }
  });

  const periodStart = normalizePeriodStart(parsed.data.periodStart, new Date());
  redirect(`/prosjekter/${parsed.data.projectId}?periodStart=${periodStart}&success=time-deleted#timer`);
}
