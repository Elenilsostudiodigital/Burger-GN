/** Day-of-week hours. `day` matches JS Date.getDay(): 0=Sunday … 6=Saturday. */
export interface DayHours {
  day: number;
  enabled: boolean;
  open: string;
  close: string;
}

export const WEEKDAY_LABELS_PT: Record<number, string> = {
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
  0: "Domingo",
};

/** Display order: Mon → Sun */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function defaultOpeningHours(): DayHours[] {
  return WEEKDAY_ORDER.map((day) => ({
    day,
    enabled: day !== 0,
    open: "08:00",
    close: "22:30",
  }));
}

export function parseOpeningHours(raw: string | null | undefined): DayHours[] {
  const fallback = defaultOpeningHours();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const byDay = new Map<number, DayHours>();
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const day = Number(row.day);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      const open = typeof row.open === "string" && /^\d{2}:\d{2}$/.test(row.open) ? row.open : "08:00";
      const close = typeof row.close === "string" && /^\d{2}:\d{2}$/.test(row.close) ? row.close : "22:30";
      byDay.set(day, {
        day,
        enabled: Boolean(row.enabled),
        open,
        close,
      });
    }
    return WEEKDAY_ORDER.map((day) => byDay.get(day) ?? {
      day,
      enabled: day !== 0,
      open: "08:00",
      close: "22:30",
    });
  } catch {
    return fallback;
  }
}

export function serializeOpeningHours(hours: DayHours[]): string {
  return JSON.stringify(parseOpeningHours(JSON.stringify(hours)));
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatHm(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Local wall-clock in America/Sao_Paulo. */
export function getSaoPauloParts(date = new Date()): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Some engines emit "24" for midnight
  if (hour === 24) hour = 0;
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: map[weekday] ?? 1, minutes: hour * 60 + minute };
}

function isWithinDayWindow(open: string, close: string, minutes: number): boolean {
  const o = parseHm(open);
  const c = parseHm(close);
  if (o === c) return true; // 24h
  if (c > o) return minutes >= o && minutes < c;
  // Overnight (e.g. 18:00 → 02:00)
  return minutes >= o || minutes < c;
}

export interface StoreOpenState {
  isOpen: boolean;
  /** Why closed — for customer messaging */
  closedReason: "manual" | "schedule" | null;
  /** Next open time today/soon as HH:mm, when closed by schedule */
  nextOpenTime: string | null;
  /** Customer-facing status line */
  statusMessage: string;
}

/**
 * Manual close always wins.
 * Auto off → only manualOpen.
 * Auto on → open only if manualOpen && within today's hours.
 */
export function resolveStoreOpenState(params: {
  manualOpen: boolean;
  useAutomaticSchedule: boolean;
  openingHours: DayHours[];
  now?: Date;
}): StoreOpenState {
  const now = params.now ?? new Date();
  const { day, minutes } = getSaoPauloParts(now);
  const hours = params.openingHours.length ? params.openingHours : defaultOpeningHours();
  const today = hours.find((h) => h.day === day);

  if (!params.manualOpen) {
    return {
      isOpen: false,
      closedReason: "manual",
      nextOpenTime: null,
      statusMessage: "Estabelecimento fechado temporariamente.",
    };
  }

  if (!params.useAutomaticSchedule) {
    return {
      isOpen: true,
      closedReason: null,
      nextOpenTime: null,
      statusMessage: "Aberto agora",
    };
  }

  if (today?.enabled && isWithinDayWindow(today.open, today.close, minutes)) {
    return {
      isOpen: true,
      closedReason: null,
      nextOpenTime: null,
      statusMessage: "Aberto agora",
    };
  }

  const nextOpenTime = findNextOpenTime(hours, day, minutes);
  return {
    isOpen: false,
    closedReason: "schedule",
    nextOpenTime,
    statusMessage: nextOpenTime
      ? `Voltamos às ${nextOpenTime}`
      : "Estabelecimento fechado no momento.",
  };
}

function findNextOpenTime(hours: DayHours[], currentDay: number, currentMinutes: number): string | null {
  for (let offset = 0; offset < 7; offset++) {
    const day = (currentDay + offset) % 7;
    const row = hours.find((h) => h.day === day);
    if (!row?.enabled) continue;
    const openMins = parseHm(row.open);
    if (offset === 0) {
      if (currentMinutes < openMins) return formatHm(openMins);
      // Overnight close already passed today's open — try later days
      const closeMins = parseHm(row.close);
      if (closeMins <= openMins && currentMinutes >= openMins) continue;
      continue;
    }
    return formatHm(openMins);
  }
  return null;
}
