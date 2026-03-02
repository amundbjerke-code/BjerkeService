import { Role, TimeEntryApprovalStatus } from "@prisma/client";

import {
  approveTimeEntryAction,
  bulkApprovePendingTimeEntriesAction,
  createEmployeeCertificateAction,
  createEmployeeAbsenceAction,
  deleteEmployeeCertificateAction,
  deleteEmployeeAbsenceAction,
  rejectTimeEntryAction,
  resetTimeEntryApprovalAction,
  upsertEmployeeProfileAction
} from "@/app/actions/hr-actions";
import { createUserAction } from "@/app/actions/user-actions";
import { db } from "@/lib/db";
import { requireRolePage } from "@/lib/rbac";
import { absenceTypeOptions, getAbsenceTypeLabel, getTimeEntryApprovalStatusColor, getTimeEntryApprovalStatusLabel } from "@/lib/time-entry-meta";
import { formatDateInput } from "@/lib/time-period";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatMoney(amount: number | null | undefined): string {
  if (typeof amount !== "number") {
    return "-";
  }
  return `${amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function formatHours(value: number): string {
  return value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStartOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getCertificateStatus(gyldigTil: Date, anchorDate: Date): { label: string; color: string; daysUntil: number } {
  const gyldigTilStart = getStartOfDay(gyldigTil);
  const daysUntil = Math.ceil((gyldigTilStart.getTime() - anchorDate.getTime()) / DAY_MS);
  if (daysUntil < 0) {
    return {
      label: `Utlopt for ${Math.abs(daysUntil)} dager siden`,
      color: "bg-red-100 text-red-800",
      daysUntil
    };
  }
  if (daysUntil === 0) {
    return {
      label: "Utloper i dag",
      color: "bg-red-100 text-red-800",
      daysUntil
    };
  }
  if (daysUntil <= 30) {
    return {
      label: `Utloper om ${daysUntil} dager`,
      color: "bg-amber-100 text-amber-800",
      daysUntil
    };
  }
  return {
    label: `Gyldig i ${daysUntil} dager til`,
    color: "bg-emerald-100 text-emerald-800",
    daysUntil
  };
}

function getSuccessMessage(value: string, count: string): string | null {
  if (value === "1") return "Bruker opprettet.";
  if (value === "employee-profile-saved") return "Ansattprofil lagret.";
  if (value === "absence-created") return "Fravaer registrert.";
  if (value === "absence-deleted") return "Fravaer slettet.";
  if (value === "certificate-created") return "Sertifikat lagret.";
  if (value === "certificate-deleted") return "Sertifikat slettet.";
  if (value === "time-approved") return "Timeregistrering godkjent.";
  if (value === "time-rejected") return "Timeregistrering avvist.";
  if (value === "time-approval-reset") return "Timegodkjenning nullstilt.";
  if (value === "time-bulk-approved") {
    const parsedCount = Number(count);
    if (Number.isFinite(parsedCount) && parsedCount > 0) {
      return `${parsedCount} ventende timeregistreringer ble godkjent.`;
    }
    return "Ventende timeregistreringer ble godkjent.";
  }
  return null;
}

export default async function AdminUsersPage({ searchParams }: Props) {
  await requireRolePage(Role.ADMIN);
  const resolvedParams = (await searchParams) ?? {};
  const error = toSingleValue(resolvedParams.error);
  const success = getSuccessMessage(toSingleValue(resolvedParams.success), toSingleValue(resolvedParams.count));
  const today = getStartOfDay(new Date());
  const todayValue = formatDateInput(today);
  const bulkStartValue = formatDateInput(addDays(today, -13));
  const defaultCertificateDateValue = formatDateInput(addDays(today, 365));
  const certificateWarningLimit = addDays(today, 30);

  const [users, projects, pendingTimeEntries, reviewedTimeEntries] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "desc" }, { name: "asc" }],
      include: {
        employeeProfile: true,
        certificates: {
          orderBy: [{ gyldigTil: "asc" }, { createdAt: "desc" }],
          take: 12
        },
        absences: {
          orderBy: [{ startDato: "desc" }],
          take: 6,
          include: {
            createdBy: {
              select: {
                name: true
              }
            }
          }
        },
        _count: {
          select: {
            createdTimeEntries: true,
            absences: true
          }
        }
      }
    }),
    db.project.findMany({
      orderBy: [{ status: "asc" }, { navn: "asc" }],
      select: {
        id: true,
        navn: true
      }
    }),
    db.timeEntry.findMany({
      where: {
        approvalStatus: TimeEntryApprovalStatus.PENDING
      },
      orderBy: [{ dato: "asc" }, { createdAt: "asc" }],
      take: 80,
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        },
        project: {
          select: {
            id: true,
            navn: true
          }
        }
      }
    }),
    db.timeEntry.findMany({
      where: {
        approvalStatus: {
          in: [TimeEntryApprovalStatus.APPROVED, TimeEntryApprovalStatus.REJECTED]
        }
      },
      orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: {
        user: { select: { name: true } },
        project: { select: { navn: true } }
      }
    })
  ]);

  const pendingByProject = pendingTimeEntries.reduce((accumulator, entry) => {
    const current = accumulator.get(entry.project.id) ?? 0;
    accumulator.set(entry.project.id, current + 1);
    return accumulator;
  }, new Map<string, number>());

  const certificateAlerts = users
    .flatMap((user) =>
      user.certificates
        .filter((certificate) => getStartOfDay(certificate.gyldigTil).getTime() <= certificateWarningLimit.getTime())
        .map((certificate) => {
          const status = getCertificateStatus(certificate.gyldigTil, today);
          return {
            id: certificate.id,
            userName: user.name,
            certificateName: certificate.navn,
            gyldigTil: certificate.gyldigTil,
            status
          };
        })
    )
    .sort((a, b) => a.gyldigTil.getTime() - b.gyldigTil.getTime());

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <h1 className="text-xl font-bold">Ansattmodul (HR Light)</h1>
        <p className="mt-1 text-sm text-brand-ink/80">
          Ansattprofiler, kompetanse, internkost, fravaer og timegodkjenning for mer korrekt fastpris-margin.
        </p>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
      {certificateAlerts.length > 0 ? (
        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Sertifikatvarsler (30 dager)</h2>
          <p className="mt-1 text-xs text-brand-ink/70">Viser utlopte sertifikater og sertifikater som utloper innen 30 dager.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {certificateAlerts.slice(0, 10).map((alert) => (
              <div key={alert.id} className="rounded-lg border border-black/10 bg-brand-canvas px-3 py-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{alert.userName}</p>
                    <p className="text-xs text-brand-ink/75">{alert.certificateName}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${alert.status.color}`}>{alert.status.label}</span>
                </div>
                <p className="mt-1 text-xs text-brand-ink/70">Gyldig til {alert.gyldigTil.toLocaleDateString("nb-NO")}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-4">
          <form action={createUserAction} className="brand-card space-y-3 p-4">
            <h2 className="text-lg font-semibold">Ny ansatt</h2>
            <label className="block text-sm font-medium">
              Navn
              <input name="name" className="brand-input mt-1" required minLength={2} />
            </label>
            <label className="block text-sm font-medium">
              E-post
              <input name="email" type="email" className="brand-input mt-1" required />
            </label>
            <label className="block text-sm font-medium">
              Midlertidig passord
              <input name="password" type="password" className="brand-input mt-1" required minLength={8} />
            </label>
            <label className="block text-sm font-medium">
              Rolle
              <select name="role" className="brand-input mt-1" defaultValue="EMPLOYEE">
                <option value="EMPLOYEE">Ansatt</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <button type="submit" className="brand-button w-full">
              Opprett bruker
            </button>
          </form>

          <form action={createEmployeeAbsenceAction} className="brand-card space-y-3 p-4">
            <h2 className="text-lg font-semibold">Registrer fravaer</h2>
            <label className="block text-sm font-medium">
              Ansatt
              <select name="userId" className="brand-input mt-1" required defaultValue="">
                <option value="" disabled>
                  Velg ansatt
                </option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Fravaerstype
              <select name="type" className="brand-input mt-1" required defaultValue={absenceTypeOptions[0]?.value}>
                {absenceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Start
                <input name="startDato" type="date" className="brand-input mt-1" defaultValue={todayValue} required />
              </label>
              <label className="block text-sm font-medium">
                Slutt
                <input name="sluttDato" type="date" className="brand-input mt-1" defaultValue={todayValue} required />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Notat
              <textarea name="notat" className="brand-input mt-1 min-h-20 resize-y" maxLength={1000} />
            </label>
            <button type="submit" className="brand-button w-full">
              Lagre fravaer
            </button>
          </form>

          <form action={createEmployeeCertificateAction} className="brand-card space-y-3 p-4">
            <h2 className="text-lg font-semibold">Registrer sertifikat</h2>
            <input type="hidden" name="redirectTo" value="/admin/users" />
            <label className="block text-sm font-medium">
              Ansatt
              <select name="userId" className="brand-input mt-1" required defaultValue="">
                <option value="" disabled>
                  Velg ansatt
                </option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Sertifikatnavn
              <input name="navn" className="brand-input mt-1" required minLength={2} maxLength={200} placeholder="F.eks. Liftkurs KL B" />
            </label>
            <label className="block text-sm font-medium">
              Gyldig til
              <input name="gyldigTil" type="date" className="brand-input mt-1" defaultValue={defaultCertificateDateValue} required />
            </label>
            <label className="block text-sm font-medium">
              Notat
              <textarea name="notat" className="brand-input mt-1 min-h-20 resize-y" maxLength={1000} />
            </label>
            <button type="submit" className="brand-button w-full">
              Lagre sertifikat
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Timegodkjenning</h2>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <h3 className="text-sm font-semibold text-amber-900">Bulk-godkjenning per prosjekt/periode</h3>
              <p className="mt-1 text-xs text-amber-800">
                Godkjenner alle ventende timer i valgt utvalg. Kun rader med status "Venter godkjenning" blir oppdatert.
              </p>
              <form action={bulkApprovePendingTimeEntriesAction} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                <input type="hidden" name="redirectTo" value="/admin/users" />
                <label className="block text-xs font-medium md:col-span-2">
                  Prosjekt (valgfritt)
                  <select name="projectId" className="brand-input mt-1 text-xs" defaultValue="">
                    <option value="">Alle prosjekter</option>
                    {projects.map((project) => {
                      const pendingCount = pendingByProject.get(project.id) ?? 0;
                      return (
                        <option key={project.id} value={project.id}>
                          {project.navn} ({pendingCount} ventende)
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="block text-xs font-medium">
                  Fra dato
                  <input name="startDato" type="date" className="brand-input mt-1 text-xs" defaultValue={bulkStartValue} required />
                </label>
                <label className="block text-xs font-medium">
                  Til dato
                  <input name="sluttDato" type="date" className="brand-input mt-1 text-xs" defaultValue={todayValue} required />
                </label>
                <button
                  type="submit"
                  className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 md:col-span-4"
                  disabled={pendingTimeEntries.length === 0}
                >
                  Godkjenn ventende timer i utvalg
                </button>
              </form>
            </div>
            {pendingTimeEntries.length === 0 ? (
              <p className="mt-2 text-sm text-brand-ink/75">Ingen timer venter pa godkjenning.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {pendingTimeEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-black/10 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{entry.user.name}</p>
                        <p className="text-xs text-brand-ink/70">
                          {entry.project.navn} - {entry.dato.toLocaleDateString("nb-NO")}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getTimeEntryApprovalStatusColor(entry.approvalStatus)}`}>
                          {getTimeEntryApprovalStatusLabel(entry.approvalStatus)}
                        </span>
                        <p className="mt-1">{formatHours(entry.timer)} t</p>
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-brand-ink/80">
                      <p>{entry.beskrivelse || "Ingen beskrivelse"}</p>
                      <p className="text-xs text-brand-ink/70">
                        Fakturerbar: {entry.fakturerbar ? "Ja" : "Nei"} | Belop: {formatMoney(entry.belopEksMva)} | Internkost/time:{" "}
                        {formatMoney(entry.internKostPerTime)}
                      </p>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <form action={approveTimeEntryAction}>
                        <input type="hidden" name="timeEntryId" value={entry.id} />
                        <input type="hidden" name="redirectTo" value="/admin/users" />
                        <button type="submit" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                          Godkjenn
                        </button>
                      </form>
                      <form action={rejectTimeEntryAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="timeEntryId" value={entry.id} />
                        <input type="hidden" name="redirectTo" value="/admin/users" />
                        <input name="comment" className="brand-input w-56 text-xs" placeholder="Arsak ved avvisning" required minLength={2} maxLength={500} />
                        <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                          Avvis
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Ansattprofiler</h2>
            {users.length === 0 ? (
              <p className="mt-2 text-sm text-brand-ink/75">Ingen ansatte opprettet enna.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {users.map((user) => (
                  <div key={user.id} className="rounded-xl border border-black/10 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{user.name}</p>
                        <p className="text-xs text-brand-ink/70">{user.email}</p>
                      </div>
                      <div className="text-right text-xs text-brand-ink/70">
                        <p>{user._count.createdTimeEntries} timerader</p>
                        <p>{user._count.absences} fravaerslinjer</p>
                      </div>
                    </div>

                    <form action={upsertEmployeeProfileAction} className="mt-2 space-y-2 border-t border-black/10 pt-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="block text-xs font-medium">
                          Navn
                          <input name="name" className="brand-input mt-1 text-xs" defaultValue={user.name} required minLength={2} maxLength={120} />
                        </label>
                        <label className="block text-xs font-medium">
                          Rolle
                          <select name="role" className="brand-input mt-1 text-xs" defaultValue={user.role}>
                            <option value="EMPLOYEE">Ansatt</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="block text-xs font-medium">
                          Telefon
                          <input name="telefon" className="brand-input mt-1 text-xs" defaultValue={user.employeeProfile?.telefon ?? ""} maxLength={50} />
                        </label>
                        <label className="block text-xs font-medium">
                          Stilling/rolle
                          <input name="stilling" className="brand-input mt-1 text-xs" defaultValue={user.employeeProfile?.stilling ?? ""} maxLength={120} />
                        </label>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="block text-xs font-medium">
                          Timelonn
                          <input
                            name="timeLonnPerTime"
                            type="number"
                            step="0.01"
                            min="0"
                            className="brand-input mt-1 text-xs"
                            defaultValue={user.employeeProfile?.timeLonnPerTime ?? ""}
                          />
                        </label>
                        <label className="block text-xs font-medium">
                          Internkost/time
                          <input
                            name="internKostPerTime"
                            type="number"
                            step="0.01"
                            min="0"
                            className="brand-input mt-1 text-xs"
                            defaultValue={user.employeeProfile?.internKostPerTime ?? ""}
                          />
                        </label>
                      </div>

                      <label className="block text-xs font-medium">
                        Fagbrev
                        <input name="fagbrev" className="brand-input mt-1 text-xs" defaultValue={user.employeeProfile?.fagbrev ?? ""} maxLength={200} />
                      </label>
                      <label className="block text-xs font-medium">
                        Sertifikater (fritekst)
                        <textarea
                          name="sertifikater"
                          className="brand-input mt-1 min-h-20 resize-y text-xs"
                          defaultValue={user.employeeProfile?.sertifikater ?? ""}
                          maxLength={4000}
                        />
                      </label>
                      <label className="block text-xs font-medium">
                        Kompetansenotat
                        <textarea
                          name="kompetanseNotat"
                          className="brand-input mt-1 min-h-20 resize-y text-xs"
                          defaultValue={user.employeeProfile?.kompetanseNotat ?? ""}
                          maxLength={4000}
                        />
                      </label>
                      <button type="submit" className="rounded-lg bg-brand-canvas px-3 py-1.5 text-xs font-semibold hover:bg-brand-canvas/80">
                        Lagre profil
                      </button>
                    </form>

                    {user.absences.length > 0 ? (
                      <div className="mt-2 space-y-1 border-t border-black/10 pt-2">
                        <p className="text-xs font-semibold text-brand-ink/80">Siste fravaer</p>
                        {user.absences.map((absence) => (
                          <div key={absence.id} className="rounded-lg bg-brand-canvas px-2 py-1 text-xs">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">{getAbsenceTypeLabel(absence.type)}</p>
                                <p className="text-brand-ink/75">
                                  {absence.startDato.toLocaleDateString("nb-NO")} - {absence.sluttDato.toLocaleDateString("nb-NO")}
                                </p>
                                {absence.notat ? <p className="text-brand-ink/70">{absence.notat}</p> : null}
                                <p className="text-brand-ink/60">Registrert av {absence.createdBy.name}</p>
                              </div>
                              <form action={deleteEmployeeAbsenceAction}>
                                <input type="hidden" name="absenceId" value={absence.id} />
                                <button type="submit" className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                  Slett
                                </button>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {user.certificates.length > 0 ? (
                      <div className="mt-2 space-y-1 border-t border-black/10 pt-2">
                        <p className="text-xs font-semibold text-brand-ink/80">Sertifikater</p>
                        {user.certificates.map((certificate) => {
                          const status = getCertificateStatus(certificate.gyldigTil, today);
                          return (
                            <div key={certificate.id} className="rounded-lg bg-brand-canvas px-2 py-1 text-xs">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium">{certificate.navn}</p>
                                  <p className="text-brand-ink/75">Gyldig til {certificate.gyldigTil.toLocaleDateString("nb-NO")}</p>
                                  {certificate.notat ? <p className="text-brand-ink/70">{certificate.notat}</p> : null}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.color}`}>{status.label}</span>
                                  <form action={deleteEmployeeCertificateAction}>
                                    <input type="hidden" name="certificateId" value={certificate.id} />
                                    <input type="hidden" name="redirectTo" value="/admin/users" />
                                    <button type="submit" className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                      Slett
                                    </button>
                                  </form>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Sist godkjente/avviste timer</h2>
            <div className="mt-2 text-xs text-brand-ink/70">
              Godkjente og avviste timer kan settes tilbake til ventende status ved behov.
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-brand-canvas text-xs uppercase tracking-wider text-brand-ink/70">
                  <tr>
                    <th className="px-2 py-2">Ansatt</th>
                    <th className="px-2 py-2">Prosjekt</th>
                    <th className="px-2 py-2">Dato</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Kommentar</th>
                    <th className="px-2 py-2">Handling</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewedTimeEntries.map((entry) => (
                    <tr key={entry.id} className="border-t border-black/10">
                      <td className="px-2 py-2">{entry.user.name}</td>
                      <td className="px-2 py-2">{entry.project.navn}</td>
                      <td className="px-2 py-2">{entry.dato.toLocaleDateString("nb-NO")}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getTimeEntryApprovalStatusColor(entry.approvalStatus)}`}>
                          {getTimeEntryApprovalStatusLabel(entry.approvalStatus)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-brand-ink/75">{entry.approvalComment ?? "-"}</td>
                      <td className="px-2 py-2">
                        <form action={resetTimeEntryApprovalAction}>
                          <input type="hidden" name="timeEntryId" value={entry.id} />
                          <input type="hidden" name="redirectTo" value="/admin/users" />
                          <button type="submit" className="rounded border border-black/15 bg-white px-2 py-1 text-xs font-semibold hover:bg-brand-canvas">
                            Sett til ventende
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
