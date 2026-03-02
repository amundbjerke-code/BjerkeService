"use client";

import { useMemo, useState } from "react";

import { getProjectSizeLabel } from "@/lib/planning";

export type PlanningBoardProps = {
  startDate: string;
  days: number;
  dateKeys: string[];
  projects: Array<{
    id: string;
    navn: string;
    status: "PLANLAGT" | "PAGAR" | "FERDIG" | "FAKTURERT";
    startDato: string;
    sluttDato: string | null;
    sizeLabel: "SMALL" | "MEDIUM" | "LARGE" | "XL";
    defaultDropHours: number;
    recommendedTeamSize: number;
    estimatedTotalHours: number;
    remainingHours: number;
  }>;
  employees: Array<{
    id: string;
    name: string;
    role: "ADMIN" | "EMPLOYEE";
    dailyCapacityHours: number;
    absenceDates: string[];
  }>;
  assignments: Array<{
    id: string;
    projectId: string;
    projectName: string;
    userId: string;
    userName: string;
    dato: string;
    timer: number;
  }>;
};

type AssignmentRow = PlanningBoardProps["assignments"][number];

type SuggestionResponse = {
  data: {
    project: {
      id: string;
      navn: string;
    };
    sizing: {
      estimatedTotalHours: number;
      remainingHours: number;
      sizeLabel: "SMALL" | "MEDIUM" | "LARGE" | "XL";
      defaultDropHours: number;
      recommendedTeamSize: number;
    };
    suggestions: Array<{
      userId: string;
      userName: string;
      dato: string;
      timer: number;
    }>;
    unallocatedHours: number;
    applied: boolean;
    appliedAssignments: Array<{
      id: string;
      projectId: string;
      userId: string;
      dato: string;
      timer: number;
      project: { id: string; navn: string };
      user: { id: string; name: string };
    }>;
  };
};

function formatHours(value: number): string {
  return value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return date.toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit" });
}

function formatWeekdayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return date.toLocaleDateString("nb-NO", { weekday: "short" });
}

function toAssignmentRow(raw: {
  id: string;
  projectId: string;
  userId: string;
  dato: string;
  timer: number;
  project: { id: string; navn: string };
  user: { id: string; name: string };
}): AssignmentRow {
  return {
    id: raw.id,
    projectId: raw.projectId,
    projectName: raw.project.navn,
    userId: raw.userId,
    userName: raw.user.name,
    dato: raw.dato.slice(0, 10),
    timer: raw.timer
  };
}

function getSizeColor(sizeLabel: PlanningBoardProps["projects"][number]["sizeLabel"]): string {
  if (sizeLabel === "SMALL") return "bg-emerald-100 text-emerald-800";
  if (sizeLabel === "MEDIUM") return "bg-blue-100 text-blue-800";
  if (sizeLabel === "LARGE") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

function isWeekend(dateKey: string): boolean {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function getStatusLabel(status: PlanningBoardProps["projects"][number]["status"]): string {
  if (status === "PLANLAGT") return "Planlagt";
  if (status === "PAGAR") return "Pagar";
  if (status === "FERDIG") return "Ferdig";
  return "Fakturert";
}

export function PlanningBoard({ startDate, days, dateKeys, projects, employees, assignments }: PlanningBoardProps) {
  const [rows, setRows] = useState<AssignmentRow[]>(assignments);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [autoProjectId, setAutoProjectId] = useState(projects[0]?.id ?? "");
  const [autoStartDate, setAutoStartDate] = useState(startDate);
  const [autoDays, setAutoDays] = useState(String(Math.min(days, 21)));
  const [suggestionState, setSuggestionState] = useState<SuggestionResponse["data"] | null>(null);

  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const employeesById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const absenceByUser = useMemo(
    () => new Map(employees.map((employee) => [employee.id, new Set(employee.absenceDates)])),
    [employees]
  );

  const rowsByCell = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const row of rows) {
      const key = `${row.userId}:${row.dato}`;
      const current = map.get(key) ?? [];
      current.push(row);
      map.set(key, current);
    }
    return map;
  }, [rows]);

  const dailyTotals = useMemo(() => {
    const map = new Map<
      string,
      {
        capacity: number;
        booked: number;
      }
    >();
    for (const dateKey of dateKeys) {
      let totalCapacity = 0;
      let totalBooked = 0;
      for (const employee of employees) {
        const capacity = isWeekend(dateKey) || (absenceByUser.get(employee.id)?.has(dateKey) ?? false) ? 0 : employee.dailyCapacityHours;
        const booked = (rowsByCell.get(`${employee.id}:${dateKey}`) ?? []).reduce((sum, row) => sum + row.timer, 0);
        totalCapacity += capacity;
        totalBooked += booked;
      }
      map.set(dateKey, {
        capacity: Number(totalCapacity.toFixed(2)),
        booked: Number(totalBooked.toFixed(2))
      });
    }
    return map;
  }, [absenceByUser, dateKeys, employees, rowsByCell]);

  const overbookedCells = useMemo(() => {
    const cells: Array<{ userId: string; dateKey: string; capacity: number; booked: number }> = [];
    for (const employee of employees) {
      for (const dateKey of dateKeys) {
        const capacity = isWeekend(dateKey) || (absenceByUser.get(employee.id)?.has(dateKey) ?? false) ? 0 : employee.dailyCapacityHours;
        const booked = (rowsByCell.get(`${employee.id}:${dateKey}`) ?? []).reduce((sum, row) => sum + row.timer, 0);
        if (booked - capacity > 0.01) {
          cells.push({ userId: employee.id, dateKey, capacity, booked: Number(booked.toFixed(2)) });
        }
      }
    }
    return cells.sort((a, b) => b.booked - b.capacity - (a.booked - a.capacity));
  }, [absenceByUser, dateKeys, employees, rowsByCell]);

  const unplannedProjects = useMemo(() => {
    const plannedProjectIds = new Set(rows.map((row) => row.projectId));
    return projects.filter((project) => !plannedProjectIds.has(project.id));
  }, [projects, rows]);

  async function readApiError(response: Response): Promise<string> {
    const data = await response.json().catch(() => null);
    if (data && typeof data.error === "string") {
      return data.error;
    }
    return `HTTP ${response.status}`;
  }

  async function handleCreateAssignment(projectId: string, userId: string, dateKey: string, timer: number): Promise<void> {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/planning/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          userId,
          dato: dateKey,
          timer
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const payload = await response.json();
      const next = toAssignmentRow({
        ...payload.data,
        dato: payload.data.dato
      });
      setRows((previous) => {
        const withoutExisting = previous.filter((entry) => entry.id !== next.id);
        return [...withoutExisting, next];
      });
      setInfo("Planlinje lagret.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Klarte ikke a lagre planlinje");
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveAssignment(assignmentId: string, userId: string, dateKey: string): Promise<void> {
    const current = rows.find((entry) => entry.id === assignmentId);
    if (!current || (current.userId === userId && current.dato === dateKey)) {
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch(`/api/planning/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          dato: dateKey
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const payload = await response.json();
      const next = toAssignmentRow({
        ...payload.data,
        dato: payload.data.dato
      });
      setRows((previous) => {
        const withoutCurrent = previous.filter((entry) => entry.id !== assignmentId && entry.id !== next.id);
        return [...withoutCurrent, next];
      });
      setInfo("Planlinje flyttet.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Klarte ikke a flytte planlinje");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateHours(assignmentId: string, timer: number): Promise<void> {
    if (!Number.isFinite(timer) || timer <= 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch(`/api/planning/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timer })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const payload = await response.json();
      const next = toAssignmentRow({
        ...payload.data,
        dato: payload.data.dato
      });
      setRows((previous) => previous.map((entry) => (entry.id === assignmentId ? next : entry)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Klarte ikke a oppdatere timer");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAssignment(assignmentId: string): Promise<void> {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch(`/api/planning/assignments/${assignmentId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      setRows((previous) => previous.filter((entry) => entry.id !== assignmentId));
      setInfo("Planlinje slettet.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Klarte ikke a slette planlinje");
    } finally {
      setBusy(false);
    }
  }

  async function runSuggestion(apply: boolean): Promise<void> {
    if (!autoProjectId) {
      setError("Velg prosjekt for bemanningsforslag.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/planning/suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: autoProjectId,
          startDato: autoStartDate,
          days: Number(autoDays),
          apply
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const payload = (await response.json()) as SuggestionResponse;
      setSuggestionState(payload.data);

      if (apply) {
        const appliedRows = payload.data.appliedAssignments.map((entry) =>
          toAssignmentRow({
            ...entry,
            dato: entry.dato
          })
        );
        setRows((previous) => {
          const next = [...previous];
          for (const appliedRow of appliedRows) {
            const existingIndex = next.findIndex((entry) => entry.id === appliedRow.id);
            if (existingIndex >= 0) {
              next[existingIndex] = appliedRow;
            } else {
              next.push(appliedRow);
            }
          }
          return next;
        });
        setInfo(`${payload.data.appliedAssignments.length} forslag lagt inn i planen.`);
      } else {
        setInfo(`Fant ${payload.data.suggestions.length} foreslatte bemanningslinjer.`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Klarte ikke a beregne forslag");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Prosjekter</h2>
          <p className="mt-1 text-xs text-brand-ink/70">Dra et prosjektkort inn i en ansatt-dag for a opprette planlinje.</p>
          <div className="mt-3 space-y-2">
            {projects.length === 0 ? (
              <p className="text-sm text-brand-ink/75">Ingen aktive prosjekter tilgjengelig for planlegging.</p>
            ) : (
              projects.map((project) => (
                <div
                  key={project.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      "application/json",
                      JSON.stringify({
                        type: "project",
                        projectId: project.id,
                        defaultHours: project.defaultDropHours
                      })
                    );
                  }}
                  className="cursor-grab rounded-xl border border-black/10 bg-brand-canvas p-3 active:cursor-grabbing"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{project.navn}</p>
                      <p className="text-xs text-brand-ink/70">{getStatusLabel(project.status)}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getSizeColor(project.sizeLabel)}`}>{getProjectSizeLabel(project.sizeLabel)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-brand-ink/75">
                    <p>Rest: {formatHours(project.remainingHours)} t</p>
                    <p>Team: {project.recommendedTeamSize}</p>
                    <p>Std dropp: {formatHours(project.defaultDropHours)} t</p>
                    <p>Estimat: {formatHours(project.estimatedTotalHours)} t</p>
                  </div>
                </div>
              ))
            )}
          </div>
          {unplannedProjects.length > 0 ? (
            <p className="mt-2 text-xs text-brand-ink/70">{unplannedProjects.length} prosjekt har ingen planlinjer i valgt horisont.</p>
          ) : null}
        </div>

        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Auto-forslag</h2>
          <p className="mt-1 text-xs text-brand-ink/70">Forslaget bruker prosjektstørrelse og tilgjengelig kapasitet per dag.</p>
          <div className="mt-3 space-y-2">
            <label className="block text-xs font-medium">
              Prosjekt
              <select value={autoProjectId} onChange={(event) => setAutoProjectId(event.target.value)} className="brand-input mt-1 text-xs">
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.navn}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium">
                Startdato
                <input type="date" value={autoStartDate} onChange={(event) => setAutoStartDate(event.target.value)} className="brand-input mt-1 text-xs" />
              </label>
              <label className="block text-xs font-medium">
                Dager
                <select value={autoDays} onChange={(event) => setAutoDays(event.target.value)} className="brand-input mt-1 text-xs">
                  <option value="7">7</option>
                  <option value="14">14</option>
                  <option value="21">21</option>
                  <option value="28">28</option>
                  <option value="42">42</option>
                  <option value="60">60</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void runSuggestion(false)} className="rounded-lg border border-black/15 bg-white px-3 py-2 text-xs font-semibold" disabled={busy}>
                Beregn forslag
              </button>
              <button type="button" onClick={() => void runSuggestion(true)} className="rounded-lg bg-brand-red px-3 py-2 text-xs font-semibold text-white" disabled={busy}>
                Legg forslag i plan
              </button>
            </div>
          </div>

          {suggestionState ? (
            <div className="mt-3 rounded-lg bg-brand-canvas p-3 text-xs">
              <p className="font-semibold">{suggestionState.project.navn}</p>
              <p>
                Estimat: {formatHours(suggestionState.sizing.estimatedTotalHours)} t, rest: {formatHours(suggestionState.sizing.remainingHours)} t
              </p>
              <p>
                Foreslatte linjer: {suggestionState.suggestions.length}, ikke allokert: {formatHours(suggestionState.unallocatedHours)} t
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {info ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{info}</p> : null}

        {overbookedCells.length > 0 ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <h3 className="text-sm font-semibold text-red-800">Overbooking-varsel</h3>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              {overbookedCells.slice(0, 8).map((cell) => (
                <div key={`${cell.userId}:${cell.dateKey}`} className="rounded-lg border border-red-200 bg-white p-2 text-xs text-red-800">
                  <p className="font-semibold">{employeesById.get(cell.userId)?.name}</p>
                  <p>
                    {cell.dateKey}: {formatHours(cell.booked)} t planlagt / {formatHours(cell.capacity)} t kapasitet
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Ingen overbooking i valgt horisont.</div>
        )}

        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Kapasitet fremover</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-brand-canvas text-xs uppercase tracking-wider text-brand-ink/70">
                <tr>
                  {dateKeys.map((dateKey) => {
                    const totals = dailyTotals.get(dateKey);
                    const capacity = totals?.capacity ?? 0;
                    const booked = totals?.booked ?? 0;
                    const loadPercent = capacity > 0 ? Math.min((booked / capacity) * 100, 200) : booked > 0 ? 200 : 0;
                    return (
                      <th key={dateKey} className="px-2 py-2 align-top">
                        <p>{formatWeekdayLabel(dateKey)}</p>
                        <p>{formatDateLabel(dateKey)}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-black/10">
                          <div className={`h-1.5 rounded-full ${loadPercent > 100 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(loadPercent, 100)}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] normal-case">
                          {formatHours(booked)} / {formatHours(capacity)} t
                        </p>
                      </th>
                    );
                  })}
                </tr>
              </thead>
            </table>
          </div>
        </div>

        <div className="brand-card p-4">
          <h2 className="text-lg font-semibold">Bemanningskalender</h2>
          <p className="mt-1 text-xs text-brand-ink/70">Dra prosjektkort eller eksisterende linjer mellom ansatte og datoer.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1300px] table-fixed border-separate border-spacing-1 text-left text-xs">
              <thead>
                <tr>
                  <th className="w-44 px-2 py-2">Ansatt</th>
                  {dateKeys.map((dateKey) => (
                    <th key={dateKey} className={`px-1 py-2 text-center ${isWeekend(dateKey) ? "text-brand-ink/50" : ""}`}>
                      <p>{formatWeekdayLabel(dateKey)}</p>
                      <p>{formatDateLabel(dateKey)}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="rounded-lg bg-brand-canvas px-2 py-2 align-top">
                      <p className="font-semibold">{employee.name}</p>
                      <p className="text-[11px] text-brand-ink/70">{employee.role === "ADMIN" ? "Admin" : "Ansatt"}</p>
                    </td>
                    {dateKeys.map((dateKey) => {
                      const cellKey = `${employee.id}:${dateKey}`;
                      const entries = rowsByCell.get(cellKey) ?? [];
                      const absent = absenceByUser.get(employee.id)?.has(dateKey) ?? false;
                      const capacity = isWeekend(dateKey) || absent ? 0 : employee.dailyCapacityHours;
                      const booked = entries.reduce((sum, row) => sum + row.timer, 0);
                      const isOverbooked = booked - capacity > 0.01;
                      return (
                        <td
                          key={cellKey}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const raw = event.dataTransfer.getData("application/json");
                            if (!raw) {
                              return;
                            }
                            const payload = JSON.parse(raw) as
                              | { type: "project"; projectId: string; defaultHours: number }
                              | { type: "assignment"; assignmentId: string };
                            if (payload.type === "project") {
                              void handleCreateAssignment(payload.projectId, employee.id, dateKey, payload.defaultHours);
                              return;
                            }
                            void handleMoveAssignment(payload.assignmentId, employee.id, dateKey);
                          }}
                          className={`align-top rounded-lg border p-1 ${
                            absent
                              ? "border-amber-300 bg-amber-50"
                              : isOverbooked
                                ? "border-red-300 bg-red-50"
                                : "border-black/10 bg-white"
                          }`}
                        >
                          <div className="mb-1 flex items-center justify-between text-[10px] text-brand-ink/70">
                            <span>{absent ? "Fravaer" : `${formatHours(booked)} / ${formatHours(capacity)} t`}</span>
                          </div>
                          <div className="space-y-1">
                            {entries.map((entry) => (
                              <div
                                key={entry.id}
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.setData(
                                    "application/json",
                                    JSON.stringify({
                                      type: "assignment",
                                      assignmentId: entry.id
                                    })
                                  );
                                }}
                                className="cursor-grab rounded-md border border-black/10 bg-brand-canvas p-1 active:cursor-grabbing"
                              >
                                <p className="truncate text-[10px] font-semibold" title={entry.projectName}>
                                  {entry.projectName}
                                </p>
                                <div className="mt-1 flex items-center justify-between gap-1">
                                  <select
                                    value={String(entry.timer)}
                                    onChange={(event) => {
                                      const next = Number(event.target.value);
                                      void handleUpdateHours(entry.id, next);
                                    }}
                                    className="w-full rounded border border-black/20 bg-white px-1 py-0.5 text-[10px]"
                                  >
                                    {[2, 4, 6, 7.5, 8, 10, 12].map((option) => (
                                      <option key={option} value={String(option)}>
                                        {option.toLocaleString("nb-NO")} t
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteAssignment(entry.id)}
                                    className="rounded border border-red-300 px-1 py-0.5 text-[10px] font-semibold text-red-700"
                                    title="Slett linje"
                                  >
                                    x
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
