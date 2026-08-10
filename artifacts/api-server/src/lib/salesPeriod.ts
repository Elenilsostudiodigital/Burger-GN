/**
 * Date helpers for the sales dashboard (America/Sao_Paulo, no DST).
 */

const SP_OFFSET = "-03:00";

export type SalesPeriodPreset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "month"
  | "custom";

export type ChartGranularity = "hour" | "day" | "month";

/** Today's calendar date in America/Sao_Paulo as YYYY-MM-DD. */
export function todayIsoSP(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Midnight America/Sao_Paulo for YYYY-MM-DD → UTC Date. */
export function startOfDaySP(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00${SP_OFFSET}`);
}

/** End of day America/Sao_Paulo for YYYY-MM-DD → UTC Date. */
export function endOfDaySP(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999${SP_OFFSET}`);
}

function addDaysIso(isoDate: string, days: number): string {
  const d = startOfDaySP(isoDate);
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  return todayIsoSP(d);
}

function daysBetweenInclusive(fromIso: string, toIso: string): number {
  const a = startOfDaySP(fromIso).getTime();
  const b = startOfDaySP(toIso).getTime();
  return Math.max(1, Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1);
}

export function resolveSalesPeriod(opts: {
  preset?: string;
  from?: unknown;
  to?: unknown;
  now?: Date;
}): {
  preset: SalesPeriodPreset;
  fromIso: string;
  toIso: string;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  prevFromIso: string;
  prevToIso: string;
  granularity: ChartGranularity;
  comparisonLabel: string;
} {
  const now = opts.now ?? new Date();
  const today = todayIsoSP(now);
  let preset: SalesPeriodPreset = "today";
  let fromIso = today;
  let toIso = today;

  const rawPreset = String(opts.preset || "").trim();
  if (
    rawPreset === "today" ||
    rawPreset === "yesterday" ||
    rawPreset === "7d" ||
    rawPreset === "30d" ||
    rawPreset === "month" ||
    rawPreset === "custom"
  ) {
    preset = rawPreset;
  } else if (isIsoDate(opts.from) && isIsoDate(opts.to)) {
    preset = "custom";
  }

  if (preset === "today") {
    fromIso = today;
    toIso = today;
  } else if (preset === "yesterday") {
    fromIso = addDaysIso(today, -1);
    toIso = fromIso;
  } else if (preset === "7d") {
    toIso = today;
    fromIso = addDaysIso(today, -6);
  } else if (preset === "30d") {
    toIso = today;
    fromIso = addDaysIso(today, -29);
  } else if (preset === "month") {
    toIso = today;
    fromIso = `${today.slice(0, 8)}01`;
  } else if (isIsoDate(opts.from) && isIsoDate(opts.to)) {
    fromIso = opts.from;
    toIso = opts.to;
    if (startOfDaySP(fromIso) > startOfDaySP(toIso)) {
      const tmp = fromIso;
      fromIso = toIso;
      toIso = tmp;
    }
  }

  const from = startOfDaySP(fromIso);
  const to = endOfDaySP(toIso);
  const span = daysBetweenInclusive(fromIso, toIso);

  const prevToIso = addDaysIso(fromIso, -1);
  const prevFromIso = addDaysIso(prevToIso, -(span - 1));
  const prevFrom = startOfDaySP(prevFromIso);
  const prevTo = endOfDaySP(prevToIso);

  let granularity: ChartGranularity = "day";
  if (span <= 1) granularity = "hour";
  else if (span > 62) granularity = "month";

  let comparisonLabel = "comparado ao período anterior";
  if (preset === "today") comparisonLabel = "comparado a ontem";
  else if (preset === "yesterday") comparisonLabel = "comparado ao dia anterior";

  return {
    preset,
    fromIso,
    toIso,
    from,
    to,
    prevFrom,
    prevTo,
    prevFromIso,
    prevToIso,
    granularity,
    comparisonLabel,
  };
}

/** Percent change; null when previous is 0 and current > 0 (avoid ÷0). */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
