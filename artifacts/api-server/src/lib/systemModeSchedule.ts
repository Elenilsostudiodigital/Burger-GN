/** America/Sao_Paulo — Burger GN weekly operation window. */
export const SYSTEM_MODE_TZ = "America/Sao_Paulo";
export const WAKE_WEEKDAY = 5; // Friday
export const WAKE_HOUR = 17;
export const WAKE_MINUTE = 30;
export const SLEEP_WEEKDAY = 1; // Monday
export const SLEEP_HOUR = 23;
export const SLEEP_MINUTE = 30;

export type SystemMode = "operation" | "sleep";

export type SaoPauloClock = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

export function saoPauloClock(at: Date): SaoPauloClock {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SYSTEM_MODE_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    weekday: weekdayMap[parts["weekday"] || "Mon"] ?? 1,
    hour: Number(parts["hour"]),
    minute: Number(parts["minute"]),
  };
}

/** Fri 17:30 → Mon 23:30 = operation; otherwise sleep. */
export function scheduledSystemMode(at: Date): SystemMode {
  const { weekday, hour, minute } = saoPauloClock(at);
  const minutes = hour * 60 + minute;
  if (weekday === WAKE_WEEKDAY) return minutes >= WAKE_HOUR * 60 + WAKE_MINUTE ? "operation" : "sleep";
  if (weekday === 6 || weekday === 0) return "operation";
  if (weekday === SLEEP_WEEKDAY) return minutes < SLEEP_HOUR * 60 + SLEEP_MINUTE ? "operation" : "sleep";
  return "sleep";
}

function zonedDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0));
  const clock = saoPauloClock(guess);
  const want = hour * 60 + minute;
  const got = clock.hour * 60 + clock.minute;
  return new Date(guess.getTime() + (want - got) * 60_000);
}

function addDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

function nextWeekdayTime(at: Date, weekday: number, hour: number, minute: number): Date {
  const clock = saoPauloClock(at);
  const nowMin = clock.hour * 60 + clock.minute;
  const targetMin = hour * 60 + minute;
  let delta = (weekday - clock.weekday + 7) % 7;
  if (delta === 0 && nowMin >= targetMin) delta = 7;
  const next = addDays(clock.year, clock.month, clock.day, delta);
  return zonedDate(next.year, next.month, next.day, hour, minute);
}

export function nextWakeAt(at: Date): Date {
  return nextWeekdayTime(at, WAKE_WEEKDAY, WAKE_HOUR, WAKE_MINUTE);
}

export function nextSleepAt(at: Date): Date {
  return nextWeekdayTime(at, SLEEP_WEEKDAY, SLEEP_HOUR, SLEEP_MINUTE);
}

export function nextTransitionAfter(at: Date): Date {
  const wake = nextWakeAt(at);
  const sleep = nextSleepAt(at);
  return wake.getTime() < sleep.getTime() ? wake : sleep;
}

export function formatSaoPauloLabel(at: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SYSTEM_MODE_TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}
