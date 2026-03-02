"use server";

import { AbsenceType, Role, TimeEntryApprovalStatus } from "@prisma/client";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireRolePage } from "@/lib/rbac";

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const upsertEmployeeProfileSchema = z.object({
  userId: z.string().cuid(),
  name: z.string().trim().min(2).max(120),
  role: z.nativeEnum(Role),
  telefon: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  stilling: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  fagbrev: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  sertifikater: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  kompetanseNotat: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  timeLonnPerTime: z.number().min(0).max(1000000).nullable(),
  internKostPerTime: z.number().min(0).max(1000000).nullable()
});

const createEmployeeAbsenceSchema = z.object({
  userId: z.string().cuid(),
  type: z.nativeEnum(AbsenceType),
  startDato: dateStringSchema,
  sluttDato: dateStringSchema,
  notat: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const deleteEmployeeAbsenceSchema = z.object({
  absenceId: z.string().cuid()
});

const timeEntryApprovalSchema = z.object({
  timeEntryId: z.string().cuid(),
  comment: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  redirectTo: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const createEmployeeCertificateSchema = z.object({
  userId: z.string().cuid(),
  navn: z.string().trim().min(2).max(200),
  gyldigTil: dateStringSchema,
  notat: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  redirectTo: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const deleteEmployeeCertificateSchema = z.object({
  certificateId: z.string().cuid(),
  redirectTo: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
});

const bulkApproveTimeEntriesSchema = z.object({
  projectId: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    z.string().cuid().nullable()
  ),
  startDato: dateStringSchema,
  sluttDato: dateStringSchema,
  redirectTo: z
    .string()
    .trim()
    .min(1)
    .max(500)
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

function safeRedirectPath(input: string | null, fallback: string): string {
  if (!input) {
    return fallback;
  }
  if (!input.startsWith("/") || input.startsWith("//")) {
    return fallback;
  }
  return input;
}

function appendQueryParam(path: string, key: string, value: string): string {
  const hashIndex = path.indexOf("#");
  const base = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash}`;
}

function parseDateAtStartOfDay(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function getNextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

export async function upsertEmployeeProfileAction(formData: FormData): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);
  const parsed = upsertEmployeeProfileSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    role: formData.get("role"),
    telefon: formData.get("telefon"),
    stilling: formData.get("stilling"),
    fagbrev: formData.get("fagbrev"),
    sertifikater: formData.get("sertifikater"),
    kompetanseNotat: formData.get("kompetanseNotat"),
    timeLonnPerTime: parseOptionalNumber(formData.get("timeLonnPerTime")),
    internKostPerTime: parseOptionalNumber(formData.get("internKostPerTime"))
  });

  if (!parsed.success) {
    redirect("/admin/users?error=Ugyldig%20ansattprofil");
  }

  try {
    const updatedUser = await db.user.update({
      where: { id: parsed.data.userId },
      data: {
        name: parsed.data.name,
        role: parsed.data.role,
        employeeProfile: {
          upsert: {
            create: {
              telefon: parsed.data.telefon,
              stilling: parsed.data.stilling,
              fagbrev: parsed.data.fagbrev,
              sertifikater: parsed.data.sertifikater,
              kompetanseNotat: parsed.data.kompetanseNotat,
              timeLonnPerTime: parsed.data.timeLonnPerTime,
              internKostPerTime: parsed.data.internKostPerTime
            },
            update: {
              telefon: parsed.data.telefon,
              stilling: parsed.data.stilling,
              fagbrev: parsed.data.fagbrev,
              sertifikater: parsed.data.sertifikater,
              kompetanseNotat: parsed.data.kompetanseNotat,
              timeLonnPerTime: parsed.data.timeLonnPerTime,
              internKostPerTime: parsed.data.internKostPerTime
            }
          }
        }
      },
      include: {
        employeeProfile: true
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "EMPLOYEE_PROFILE_UPSERTED",
      entityType: "USER",
      entityId: updatedUser.id,
      metadata: {
        role: updatedUser.role,
        hasProfile: !!updatedUser.employeeProfile
      }
    });

    redirect("/admin/users?success=employee-profile-saved");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/admin/users?error=Klarte%20ikke%20a%20lagre%20ansattprofil");
  }
}

export async function createEmployeeAbsenceAction(formData: FormData): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);
  const parsed = createEmployeeAbsenceSchema.safeParse({
    userId: formData.get("userId"),
    type: formData.get("type"),
    startDato: formData.get("startDato"),
    sluttDato: formData.get("sluttDato"),
    notat: formData.get("notat")
  });

  if (!parsed.success) {
    redirect("/admin/users?error=Ugyldig%20fravaerregistrering");
  }

  const startDate = new Date(`${parsed.data.startDato}T00:00:00`);
  const endDate = new Date(`${parsed.data.sluttDato}T00:00:00`);
  if (endDate.getTime() < startDate.getTime()) {
    redirect("/admin/users?error=Sluttdato%20kan%20ikke%20vaere%20for%20startdato");
  }

  try {
    const created = await db.employeeAbsence.create({
      data: {
        userId: parsed.data.userId,
        type: parsed.data.type,
        startDato: startDate,
        sluttDato: endDate,
        notat: parsed.data.notat,
        createdById: session.user.id
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "EMPLOYEE_ABSENCE_CREATED",
      entityType: "EMPLOYEE_ABSENCE",
      entityId: created.id,
      metadata: {
        userId: created.userId,
        type: created.type,
        startDato: created.startDato,
        sluttDato: created.sluttDato
      }
    });

    redirect("/admin/users?success=absence-created");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/admin/users?error=Klarte%20ikke%20a%20lagre%20fravaer");
  }
}

export async function deleteEmployeeAbsenceAction(formData: FormData): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);
  const parsed = deleteEmployeeAbsenceSchema.safeParse({
    absenceId: formData.get("absenceId")
  });

  if (!parsed.success) {
    redirect("/admin/users?error=Ugyldig%20fravaerslinje");
  }

  try {
    const existing = await db.employeeAbsence.findUnique({
      where: { id: parsed.data.absenceId },
      select: {
        id: true,
        userId: true,
        type: true
      }
    });

    if (!existing) {
      redirect("/admin/users?error=Fravaerslinje%20ikke%20funnet");
    }

    await db.employeeAbsence.delete({
      where: { id: existing.id }
    });

    await logAudit({
      actorId: session.user.id,
      action: "EMPLOYEE_ABSENCE_DELETED",
      entityType: "EMPLOYEE_ABSENCE",
      entityId: existing.id,
      metadata: {
        userId: existing.userId,
        type: existing.type
      }
    });

    redirect("/admin/users?success=absence-deleted");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect("/admin/users?error=Klarte%20ikke%20a%20slette%20fravaer");
  }
}

export async function createEmployeeCertificateAction(formData: FormData): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);
  const parsed = createEmployeeCertificateSchema.safeParse({
    userId: formData.get("userId"),
    navn: formData.get("navn"),
    gyldigTil: formData.get("gyldigTil"),
    notat: formData.get("notat"),
    redirectTo: formData.get("redirectTo")
  });

  const fallbackRedirect = "/admin/users";
  const redirectPath = safeRedirectPath(parsed.success ? parsed.data.redirectTo : null, fallbackRedirect);
  if (!parsed.success) {
    redirect(appendQueryParam(redirectPath, "error", "Ugyldig sertifikatregistrering"));
  }

  const gyldigTil = parseDateAtStartOfDay(parsed.data.gyldigTil);
  if (Number.isNaN(gyldigTil.getTime())) {
    redirect(appendQueryParam(redirectPath, "error", "Ugyldig gyldig-til dato"));
  }

  try {
    const created = await db.employeeCertificate.create({
      data: {
        userId: parsed.data.userId,
        navn: parsed.data.navn,
        gyldigTil,
        notat: parsed.data.notat
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "EMPLOYEE_CERTIFICATE_CREATED",
      entityType: "EMPLOYEE_CERTIFICATE",
      entityId: created.id,
      metadata: {
        userId: created.userId,
        navn: created.navn,
        gyldigTil: created.gyldigTil
      }
    });

    redirect(appendQueryParam(redirectPath, "success", "certificate-created"));
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect(appendQueryParam(redirectPath, "error", "Klarte ikke a lagre sertifikat"));
  }
}

export async function deleteEmployeeCertificateAction(formData: FormData): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);
  const parsed = deleteEmployeeCertificateSchema.safeParse({
    certificateId: formData.get("certificateId"),
    redirectTo: formData.get("redirectTo")
  });

  const fallbackRedirect = "/admin/users";
  const redirectPath = safeRedirectPath(parsed.success ? parsed.data.redirectTo : null, fallbackRedirect);
  if (!parsed.success) {
    redirect(appendQueryParam(redirectPath, "error", "Ugyldig sertifikatlinje"));
  }

  try {
    const existing = await db.employeeCertificate.findUnique({
      where: { id: parsed.data.certificateId },
      select: {
        id: true,
        userId: true,
        navn: true,
        gyldigTil: true
      }
    });

    if (!existing) {
      redirect(appendQueryParam(redirectPath, "error", "Sertifikat ikke funnet"));
    }

    await db.employeeCertificate.delete({
      where: { id: existing.id }
    });

    await logAudit({
      actorId: session.user.id,
      action: "EMPLOYEE_CERTIFICATE_DELETED",
      entityType: "EMPLOYEE_CERTIFICATE",
      entityId: existing.id,
      metadata: {
        userId: existing.userId,
        navn: existing.navn,
        gyldigTil: existing.gyldigTil
      }
    });

    redirect(appendQueryParam(redirectPath, "success", "certificate-deleted"));
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect(appendQueryParam(redirectPath, "error", "Klarte ikke a slette sertifikat"));
  }
}

export async function bulkApprovePendingTimeEntriesAction(formData: FormData): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);
  const parsed = bulkApproveTimeEntriesSchema.safeParse({
    projectId: formData.get("projectId"),
    startDato: formData.get("startDato"),
    sluttDato: formData.get("sluttDato"),
    redirectTo: formData.get("redirectTo")
  });

  const fallbackRedirect = "/admin/users";
  const redirectPath = safeRedirectPath(parsed.success ? parsed.data.redirectTo : null, fallbackRedirect);
  if (!parsed.success) {
    redirect(appendQueryParam(redirectPath, "error", "Ugyldig bulk-godkjenning"));
  }

  const startDate = parseDateAtStartOfDay(parsed.data.startDato);
  const endDate = parseDateAtStartOfDay(parsed.data.sluttDato);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    redirect(appendQueryParam(redirectPath, "error", "Ugyldig datoperiode"));
  }
  if (endDate.getTime() < startDate.getTime()) {
    redirect(appendQueryParam(redirectPath, "error", "Sluttdato kan ikke vaere for startdato"));
  }

  try {
    const endExclusive = getNextDay(endDate);
    const where = {
      approvalStatus: TimeEntryApprovalStatus.PENDING,
      dato: {
        gte: startDate,
        lt: endExclusive
      },
      ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {})
    };

    const candidates = await db.timeEntry.findMany({
      where,
      select: {
        id: true
      }
    });

    if (candidates.length === 0) {
      redirect(appendQueryParam(redirectPath, "error", "Ingen ventende timer i valgt utvalg"));
    }

    const candidateIds = candidates.map((entry) => entry.id);
    const updated = await db.timeEntry.updateMany({
      where: { id: { in: candidateIds } },
      data: {
        approvalStatus: TimeEntryApprovalStatus.APPROVED,
        approvedById: session.user.id,
        approvedAt: new Date(),
        approvalComment: null
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "TIME_ENTRY_BULK_APPROVED",
      entityType: "TIME_ENTRY",
      entityId: null,
      metadata: {
        projectId: parsed.data.projectId,
        startDato: parsed.data.startDato,
        sluttDato: parsed.data.sluttDato,
        candidateCount: candidates.length,
        updatedCount: updated.count
      }
    });

    const successWithCode = appendQueryParam(redirectPath, "success", "time-bulk-approved");
    redirect(appendQueryParam(successWithCode, "count", String(updated.count)));
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect(appendQueryParam(redirectPath, "error", "Klarte ikke a bulk-godkjenne timer"));
  }
}

async function updateTimeApprovalAction(
  formData: FormData,
  mode: "approve" | "reject" | "reset"
): Promise<void> {
  const session = await requireRolePage(Role.ADMIN);
  const parsed = timeEntryApprovalSchema.safeParse({
    timeEntryId: formData.get("timeEntryId"),
    comment: formData.get("comment"),
    redirectTo: formData.get("redirectTo")
  });

  const fallbackRedirect = "/timer";
  const redirectPath = safeRedirectPath(parsed.success ? parsed.data.redirectTo : null, fallbackRedirect);
  if (!parsed.success) {
    redirect(appendQueryParam(redirectPath, "error", "Ugyldig timegodkjenning"));
  }

  if (mode === "reject" && !parsed.data.comment) {
    redirect(appendQueryParam(redirectPath, "error", "Legg inn en kommentar for avvisning"));
  }

  try {
    const existing = await db.timeEntry.findUnique({
      where: { id: parsed.data.timeEntryId },
      select: {
        id: true,
        projectId: true,
        approvalStatus: true
      }
    });

    if (!existing) {
      redirect(appendQueryParam(redirectPath, "error", "Timeregistrering ikke funnet"));
    }

    const nextStatus =
      mode === "approve"
        ? TimeEntryApprovalStatus.APPROVED
        : mode === "reject"
          ? TimeEntryApprovalStatus.REJECTED
          : TimeEntryApprovalStatus.PENDING;

    await db.timeEntry.update({
      where: { id: existing.id },
      data: {
        approvalStatus: nextStatus,
        approvedById: nextStatus === TimeEntryApprovalStatus.PENDING ? null : session.user.id,
        approvedAt: nextStatus === TimeEntryApprovalStatus.PENDING ? null : new Date(),
        approvalComment: mode === "reset" ? null : parsed.data.comment
      }
    });

    await logAudit({
      actorId: session.user.id,
      action: "TIME_ENTRY_APPROVAL_UPDATED",
      entityType: "TIME_ENTRY",
      entityId: existing.id,
      metadata: {
        projectId: existing.projectId,
        previousStatus: existing.approvalStatus,
        nextStatus,
        comment: parsed.data.comment
      }
    });

    const successCode = mode === "approve" ? "time-approved" : mode === "reject" ? "time-rejected" : "time-approval-reset";
    redirect(appendQueryParam(redirectPath, "success", successCode));
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    redirect(appendQueryParam(redirectPath, "error", "Klarte ikke a oppdatere timegodkjenning"));
  }
}

export async function approveTimeEntryAction(formData: FormData): Promise<void> {
  await updateTimeApprovalAction(formData, "approve");
}

export async function rejectTimeEntryAction(formData: FormData): Promise<void> {
  await updateTimeApprovalAction(formData, "reject");
}

export async function resetTimeEntryApprovalAction(formData: FormData): Promise<void> {
  await updateTimeApprovalAction(formData, "reset");
}
