import { ProjectBillingType } from "@prisma/client";

import { formatDateInput } from "@/lib/time-period";

export const DEFAULT_DAILY_CAPACITY_HOURS = 7.5;

const SMALL_PROJECT_HOURS = 48;
const MEDIUM_PROJECT_HOURS = 120;
const LARGE_PROJECT_HOURS = 240;

export type ProjectSizingInput = {
  billingType: ProjectBillingType;
  fastprisBelopEksMva: number | null;
  timeprisEksMva: number | null;
  offerEstimateHours: number | null;
  loggedHours: number;
};

export type ProjectSizingResult = {
  estimatedTotalHours: number;
  remainingHours: number;
  sizeLabel: "SMALL" | "MEDIUM" | "LARGE" | "XL";
  defaultDropHours: number;
  recommendedTeamSize: number;
};

export type CapacityEmployee = {
  userId: string;
  name: string;
  dailyCapacityHours: number;
  absenceDateKeys: Set<string>;
};

export type PlanningSuggestion = {
  userId: string;
  userName: string;
  dato: string;
  timer: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDaysUtc(date: Date, days: number): Date {
  const value = startOfUtcDay(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

export function parseDateInputToUtc(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export function getDateKeysInRange(start: Date, days: number): string[] {
  return Array.from({ length: Math.max(days, 0) }, (_, index) => formatDateInput(addDaysUtc(start, index)));
}

export function isWeekendDateKey(dateKey: string): boolean {
  const date = parseDateInputToUtc(dateKey);
  if (!date) {
    return false;
  }
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function roundToQuarterHours(value: number): number {
  return Math.round(value * 4) / 4;
}

export function getProjectSizing(input: ProjectSizingInput): ProjectSizingResult {
  const offerHours = input.offerEstimateHours && input.offerEstimateHours > 0 ? input.offerEstimateHours : null;
  const fastprisHours =
    input.fastprisBelopEksMva && input.fastprisBelopEksMva > 0 && input.timeprisEksMva && input.timeprisEksMva > 0
      ? input.fastprisBelopEksMva / input.timeprisEksMva
      : null;

  const baselineEstimate = offerHours ?? fastprisHours ?? (input.billingType === "FASTPRIS" ? 80 : 56);
  const estimatedTotalHours = Math.max(baselineEstimate, input.loggedHours > 0 ? input.loggedHours * 1.15 : 0);
  const remainingHours = Math.max(estimatedTotalHours - input.loggedHours, 4);

  if (estimatedTotalHours <= SMALL_PROJECT_HOURS) {
    return {
      estimatedTotalHours,
      remainingHours,
      sizeLabel: "SMALL",
      defaultDropHours: 4,
      recommendedTeamSize: 1
    };
  }
  if (estimatedTotalHours <= MEDIUM_PROJECT_HOURS) {
    return {
      estimatedTotalHours,
      remainingHours,
      sizeLabel: "MEDIUM",
      defaultDropHours: 6,
      recommendedTeamSize: 2
    };
  }
  if (estimatedTotalHours <= LARGE_PROJECT_HOURS) {
    return {
      estimatedTotalHours,
      remainingHours,
      sizeLabel: "LARGE",
      defaultDropHours: 7.5,
      recommendedTeamSize: 3
    };
  }
  return {
    estimatedTotalHours,
    remainingHours,
    sizeLabel: "XL",
    defaultDropHours: 8,
    recommendedTeamSize: 4
  };
}

export function buildAutoSuggestions(input: {
  projectSizing: ProjectSizingResult;
  employees: CapacityEmployee[];
  dateKeys: string[];
  existingHoursByUserDate: Map<string, number>;
}): { suggestions: PlanningSuggestion[]; unallocatedHours: number } {
  let remaining = input.projectSizing.remainingHours;
  const workingHoursByKey = new Map(input.existingHoursByUserDate);
  const suggestions: PlanningSuggestion[] = [];

  for (const dateKey of input.dateKeys) {
    if (remaining <= 0) {
      break;
    }
    if (isWeekendDateKey(dateKey)) {
      continue;
    }

    const availableEmployees = input.employees
      .map((employee) => {
        const userDateKey = `${employee.userId}:${dateKey}`;
        const existingHours = workingHoursByKey.get(userDateKey) ?? 0;
        const dailyCapacity = employee.absenceDateKeys.has(dateKey) ? 0 : employee.dailyCapacityHours;
        const available = Math.max(dailyCapacity - existingHours, 0);
        return {
          ...employee,
          userDateKey,
          available
        };
      })
      .filter((employee) => employee.available > 0)
      .sort((a, b) => b.available - a.available);

    if (availableEmployees.length === 0) {
      continue;
    }

    const selected = availableEmployees.slice(0, Math.max(1, input.projectSizing.recommendedTeamSize));
    let remainingForDay = Math.min(remaining, selected.reduce((sum, employee) => sum + employee.available, 0));

    for (let index = 0; index < selected.length; index += 1) {
      if (remainingForDay <= 0) {
        break;
      }
      const employee = selected[index];
      const remainingSlots = selected.length - index;
      const targetShare = roundToQuarterHours(remainingForDay / remainingSlots);
      const allocated = Math.min(employee.available, Math.max(targetShare, 0.25), remainingForDay);
      const roundedAllocated = roundToQuarterHours(allocated);
      if (roundedAllocated <= 0) {
        continue;
      }
      suggestions.push({
        userId: employee.userId,
        userName: employee.name,
        dato: dateKey,
        timer: roundedAllocated
      });
      workingHoursByKey.set(employee.userDateKey, (workingHoursByKey.get(employee.userDateKey) ?? 0) + roundedAllocated);
      remainingForDay = Math.max(remainingForDay - roundedAllocated, 0);
      remaining = Math.max(remaining - roundedAllocated, 0);
    }
  }

  return {
    suggestions,
    unallocatedHours: Math.max(remaining, 0)
  };
}

export function getProjectSizeLabel(size: ProjectSizingResult["sizeLabel"]): string {
  if (size === "SMALL") return "Liten";
  if (size === "MEDIUM") return "Medium";
  if (size === "LARGE") return "Stor";
  return "Ekstra stor";
}
