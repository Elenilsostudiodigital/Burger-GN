import {
  BusinessHoursDaySchedule,
  BusinessHoursManualMode,
  BusinessHoursSettings,
  WeekdayKey,
  WeeklySchedule,
} from "@workspace/db";

export const STORE_TZ = "America/Sao_Paulo";

export const WEEKDAY_KEYS: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
  sunday: "Domingo",
};

const WEEKDAY_SHORT_TO_KEY: Record<string, WeekdayKey> = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

/** Safe always-open default so deploy does not accidentally close the storefront. */
export function defaultWeeklySchedule(): WeeklySchedule {
  const day = (): BusinessHoursDaySchedule => ({
    active: true,
    open: "00:00",
    close: "23:59",
  });
  return {
    monday: day(),
    tuesday: day(),
    wednesday: day(),
    thursday: day(),
    friday: day(),
    saturday: day(),
    sunday: day(),
  };
}

export function normalizeTimeHHmm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function parseHHmmToMinutes(value: string): number | null {
  const normalized = normalizeTimeHHmm(value);
  if (!normalized) return null;
  const [h, m] = normalized.split(":").map(Number);
  return h * 60 + m;
}

export function normalizeDaySchedule(raw: unknown): BusinessHoursDaySchedule {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const open = normalizeTimeHHmm(obj.open) ?? "18:00";
  const close = normalizeTimeHHmm(obj.close) ?? "23:00";
  const active = obj.active === false ? false : true;
  return { active, open, close };
}

export function normalizeWeeklySchedule(raw: unknown): WeeklySchedule {
  const base = defaultWeeklySchedule();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const key of WEEKDAY_KEYS) {
    if (obj[key] != null) base[key] = normalizeDaySchedule(obj[key]);
  }
  return base;
}

export function normalizeManualMode(raw: unknown): BusinessHoursManualMode {
  if (raw === "open" || raw === "closed" || raw === "auto") return raw;
  return "auto";
}

export interface StoreLocalNow {
  dateIso: string;
  weekday: WeekdayKey;
  minutes: number;
  timeHHmm: string;
}

export function getStoreLocalNow(now = new Date(), timeZone = STORE_TZ): StoreLocalNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayShort = get("weekday").replace(".", "").toLowerCase().slice(0, 3);
  const weekday = WEEKDAY_SHORT_TO_KEY[weekdayShort] ?? "monday";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = Number(get("hour"));
  const minute = Number(get("minute"));
  if (hour === 24) hour = 0;
  const timeHHmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    dateIso: `${year}-${month}-${day}`,
    weekday,
    minutes: hour * 60 + minute,
    timeHHmm,
  };
}

/** True when `nowMinutes` is inside [open, close). Supports overnight (close <= open). */
export function isWithinWindow(nowMinutes: number, open: string, close: string): boolean {
  const openM = parseHHmmToMinutes(open);
  const closeM = parseHHmmToMinutes(close);
  if (openM == null || closeM == null) return false;
  if (openM === closeM) return true; // 24h window for that day
  if (closeM > openM) return nowMinutes >= openM && nowMinutes < closeM;
  // overnight e.g. 18:00 → 02:00
  return nowMinutes >= openM || nowMinutes < closeM;
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000;
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function weekdayForDateIso(dateIso: string): WeekdayKey {
  // Noon UTC avoids DST edge; Brazil currently has no DST.
  const [y, m, d] = dateIso.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  return getStoreLocalNow(noonUtc).weekday;
}

export type StoreStatusReason =
  | "manual_open"
  | "manual_closed"
  | "schedule_open"
  | "outside_hours"
  | "day_closed"
  | "exception_closed";

export interface EffectiveDayHours {
  active: boolean;
  open: string;
  close: string;
  source: "schedule" | "exception";
  closedAllDay: boolean;
}

export function resolveEffectiveDayHours(
  settings: Pick<
    BusinessHoursSettings,
    "weeklySchedule" | "exceptionDate" | "exceptionClosed" | "exceptionOpen" | "exceptionClose"
  >,
  dateIso: string,
  weekday: WeekdayKey,
): EffectiveDayHours {
  const schedule = normalizeWeeklySchedule(settings.weeklySchedule);
  const day = schedule[weekday];

  if (settings.exceptionDate === dateIso) {
    if (settings.exceptionClosed) {
      return {
        active: false,
        open: day.open,
        close: day.close,
        source: "exception",
        closedAllDay: true,
      };
    }
    const open = normalizeTimeHHmm(settings.exceptionOpen) ?? day.open;
    const close = normalizeTimeHHmm(settings.exceptionClose) ?? day.close;
    return {
      active: true,
      open,
      close,
      source: "exception",
      closedAllDay: false,
    };
  }

  return {
    active: day.active,
    open: day.open,
    close: day.close,
    source: "schedule",
    closedAllDay: !day.active,
  };
}

export interface StoreStatusResult {
  isOpen: boolean;
  reason: StoreStatusReason;
  message: string;
  nextOpenTime: string | null;
  nextOpenLabel: string | null;
  timezone: string;
  manualMode: BusinessHoursManualMode;
  localTime: string;
  localDate: string;
  today: EffectiveDayHours;
}

function findNextOpenTime(
  settings: BusinessHoursSettings,
  local: StoreLocalNow,
): string | null {
  // Later today?
  const todayHours = resolveEffectiveDayHours(settings, local.dateIso, local.weekday);
  if (todayHours.active && !todayHours.closedAllDay) {
    const openM = parseHHmmToMinutes(todayHours.open);
    if (openM != null && local.minutes < openM) return todayHours.open;
    // Overnight already open earlier — if currently closed and overnight window starts later tonight
    const closeM = parseHHmmToMinutes(todayHours.close);
    const openMins = openM ?? 0;
    if (closeM != null && closeM <= openMins && local.minutes < openMins) {
      return todayHours.open;
    }
  }

  for (let i = 1; i <= 7; i++) {
    const dateIso = addDaysIso(local.dateIso, i);
    const weekday = weekdayForDateIso(dateIso);
    const hours = resolveEffectiveDayHours(settings, dateIso, weekday);
    if (hours.active && !hours.closedAllDay) return hours.open;
  }
  return null;
}

export function evaluateStoreStatus(
  settings: BusinessHoursSettings,
  now = new Date(),
): StoreStatusResult {
  const timezone = settings.timezone || STORE_TZ;
  const local = getStoreLocalNow(now, timezone);
  const manualMode = normalizeManualMode(settings.manualMode);
  const today = resolveEffectiveDayHours(settings, local.dateIso, local.weekday);

  if (manualMode === "closed") {
    return {
      isOpen: false,
      reason: "manual_closed",
      message: "No momento não estamos aceitando pedidos.",
      nextOpenTime: null,
      nextOpenLabel: null,
      timezone,
      manualMode,
      localTime: local.timeHHmm,
      localDate: local.dateIso,
      today,
    };
  }

  if (manualMode === "open") {
    return {
      isOpen: true,
      reason: "manual_open",
      message: "Loja aberta",
      nextOpenTime: null,
      nextOpenLabel: null,
      timezone,
      manualMode,
      localTime: local.timeHHmm,
      localDate: local.dateIso,
      today,
    };
  }

  if (today.closedAllDay || !today.active) {
    const next = findNextOpenTime(settings, local);
    return {
      isOpen: false,
      reason: today.source === "exception" ? "exception_closed" : "day_closed",
      message: "Estamos fechados no momento.",
      nextOpenTime: next,
      nextOpenLabel: next ? `Voltaremos às ${next}` : null,
      timezone,
      manualMode,
      localTime: local.timeHHmm,
      localDate: local.dateIso,
      today,
    };
  }

  if (isWithinWindow(local.minutes, today.open, today.close)) {
    return {
      isOpen: true,
      reason: "schedule_open",
      message: "Loja aberta",
      nextOpenTime: null,
      nextOpenLabel: null,
      timezone,
      manualMode,
      localTime: local.timeHHmm,
      localDate: local.dateIso,
      today,
    };
  }

  const next = findNextOpenTime(settings, local);
  return {
    isOpen: false,
    reason: "outside_hours",
    message: "Estamos fechados no momento.",
    nextOpenTime: next,
    nextOpenLabel: next ? `Voltaremos às ${next}` : null,
    timezone,
    manualMode,
    localTime: local.timeHHmm,
    localDate: local.dateIso,
    today,
  };
}

export function toAdminBusinessHoursPayload(settings: BusinessHoursSettings, now = new Date()) {
  const status = evaluateStoreStatus(settings, now);
  return {
    id: settings.id,
    companyId: settings.companyId,
    timezone: settings.timezone || STORE_TZ,
    manualMode: normalizeManualMode(settings.manualMode),
    weeklySchedule: normalizeWeeklySchedule(settings.weeklySchedule),
    exceptionDate: settings.exceptionDate,
    exceptionClosed: !!settings.exceptionClosed,
    exceptionOpen: settings.exceptionOpen,
    exceptionClose: settings.exceptionClose,
    updatedAt: settings.updatedAt,
    status,
    weekdayLabels: WEEKDAY_LABELS,
  };
}
