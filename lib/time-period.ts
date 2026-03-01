const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = 14;
const BASE_PERIOD_START_UTC = Date.UTC(2026, 0, 5);

export type TimePeriod = {
  start: Date;
  endInclusive: Date;
  endExclusive: Date;
};

function normalizeToUtcDate(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function parseDateInput(value: string): Date | null {
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

export function formatDateInput(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function get14DayPeriodFromDate(date: Date): TimePeriod {
  const normalized = normalizeToUtcDate(date);
  const diffDays = Math.floor((normalized.getTime() - BASE_PERIOD_START_UTC) / DAY_MS);
  const index = Math.floor(diffDays / PERIOD_DAYS);
  const startMs = BASE_PERIOD_START_UTC + index * PERIOD_DAYS * DAY_MS;
  const start = new Date(startMs);
  const endExclusive = new Date(startMs + PERIOD_DAYS * DAY_MS);
  const endInclusive = new Date(endExclusive.getTime() - DAY_MS);
  return {
    start,
    endInclusive,
    endExclusive
  };
}

export function get14DayPeriodFromInput(input: string | null | undefined): TimePeriod {
  const parsed = input ? parseDateInput(input) : null;
  if (!parsed) {
    return get14DayPeriodFromDate(new Date());
  }
  return get14DayPeriodFromDate(parsed);
}

export function shiftPeriod(period: TimePeriod, steps: number): TimePeriod {
  const nextStart = new Date(period.start.getTime() + steps * PERIOD_DAYS * DAY_MS);
  return get14DayPeriodFromDate(nextStart);
}

export function buildPeriodOptions(anchor: TimePeriod, before = 4, after = 4): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  for (let offset = -before; offset <= after; offset += 1) {
    const period = shiftPeriod(anchor, offset);
    options.push({
      value: formatDateInput(period.start),
      label: `${formatDateInput(period.start)} til ${formatDateInput(period.endInclusive)}`
    });
  }
  return options;
}
