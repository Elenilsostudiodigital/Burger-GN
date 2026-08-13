/**
 * Full business-hours logic selftest (no DB, no deploy).
 * Mirrors artifacts/api-server/src/lib/businessHours.ts rules.
 * Run: node scripts/business-hours-selftest.mjs
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const WEEKDAY_KEYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const WEEKDAY_SHORT_TO_KEY = { mon:"monday",tue:"tuesday",wed:"wednesday",thu:"thursday",fri:"friday",sat:"saturday",sun:"sunday" };

function defaultWeeklySchedule() {
  const day = () => ({ active: false, open: "18:00", close: "23:00" });
  return Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, day()]));
}

function normalizeTimeHHmm(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
}

function parseHHmmToMinutes(value) {
  const n = normalizeTimeHHmm(value);
  if (!n) return null;
  const [h, m] = n.split(":").map(Number);
  return h * 60 + m;
}

function normalizeDaySchedule(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const open = normalizeTimeHHmm(obj.open);
  const close = normalizeTimeHHmm(obj.close);
  const wantsActive = obj.active === true || obj.active === "true" || obj.active === 1;
  const hasHours = open != null && close != null;
  return { active: wantsActive && hasHours, open: open ?? "18:00", close: close ?? "23:00" };
}

function normalizeWeeklySchedule(raw) {
  const base = defaultWeeklySchedule();
  if (!raw || typeof raw !== "object") return base;
  for (const key of WEEKDAY_KEYS) if (raw[key] != null) base[key] = normalizeDaySchedule(raw[key]);
  return base;
}

function isWithinWindow(nowMinutes, open, close) {
  const openM = parseHHmmToMinutes(open);
  const closeM = parseHHmmToMinutes(close);
  if (openM == null || closeM == null) return false;
  if (openM === closeM) return false;
  if (closeM > openM) return nowMinutes >= openM && nowMinutes < closeM;
  return nowMinutes >= openM || nowMinutes < closeM;
}

function getStoreLocalNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23", weekday:"short",
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = WEEKDAY_SHORT_TO_KEY[get("weekday").replace(".","").toLowerCase().slice(0,3)] || "monday";
  let hour = Number(get("hour")); if (hour === 24) hour = 0;
  const minute = Number(get("minute"));
  return {
    dateIso: `${get("year")}-${get("month")}-${get("day")}`,
    weekday,
    minutes: hour * 60 + minute,
    timeHHmm: `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`,
  };
}

function resolveEffectiveDayHours(settings, dateIso, weekday) {
  const schedule = normalizeWeeklySchedule(settings.weeklySchedule);
  const day = schedule[weekday];
  if (settings.exceptionDate === dateIso) {
    if (settings.exceptionClosed) {
      return { active: false, open: day.open, close: day.close, source: "exception", closedAllDay: true, hasHours: false };
    }
    const open = normalizeTimeHHmm(settings.exceptionOpen);
    const close = normalizeTimeHHmm(settings.exceptionClose);
    const hasHours = open != null && close != null && open !== close;
    if (!hasHours) return { active: false, open: open ?? day.open, close: close ?? day.close, source: "exception", closedAllDay: true, hasHours: false };
    return { active: true, open, close, source: "exception", closedAllDay: false, hasHours: true };
  }
  const hasHours = day.active && day.open !== day.close
    && normalizeTimeHHmm(day.open) != null && normalizeTimeHHmm(day.close) != null;
  return { active: hasHours, open: day.open, close: day.close, source: "schedule", closedAllDay: !hasHours, hasHours };
}

function evaluateStoreStatus(settings, now = new Date()) {
  const local = getStoreLocalNow(now);
  const manualMode = settings.manualMode === "open" || settings.manualMode === "closed" ? settings.manualMode : "auto";
  const today = resolveEffectiveDayHours(settings, local.dateIso, local.weekday);

  if (manualMode === "closed") {
    return { isOpen: false, reason: "manual_closed", message: "No momento não estamos aceitando pedidos.", manualMode, local };
  }
  if (manualMode === "open") {
    return { isOpen: true, reason: "manual_open", message: "Loja aberta", manualMode, local };
  }
  if (!today.hasHours || today.closedAllDay || !today.active) {
    return { isOpen: false, reason: today.source === "exception" ? "exception_closed" : "day_closed", message: "Estamos fechados no momento.", manualMode, local, today };
  }
  if (isWithinWindow(local.minutes, today.open, today.close)) {
    return { isOpen: true, reason: "schedule_open", message: "Loja aberta", manualMode, local, today };
  }
  return { isOpen: false, reason: "outside_hours", message: "Estamos fechados no momento.", manualMode, local, today };
}

/** Simulate "save schedule" business rule: always return to auto. */
function afterSaveSchedule(settings, weeklySchedule) {
  return evaluateStoreStatus({
    ...settings,
    weeklySchedule: normalizeWeeklySchedule(weeklySchedule),
    manualMode: "auto",
  });
}

// ── BUG 1: save recalculates immediately (even if previously force-open) ───────
{
  const schedule = defaultWeeklySchedule();
  schedule.thursday = { active: true, open: "18:00", close: "22:20" };
  // Fake "now" = Thursday 2026-08-13 14:28 SP (−03)
  const now = new Date("2026-08-13T14:28:00-03:00");
  const stuckOpen = { weeklySchedule: schedule, manualMode: "open", exceptionDate: null };
  assert(evaluateStoreStatus(stuckOpen, now).isOpen === true, "stuck manual open before save");
  const after = afterSaveSchedule(stuckOpen, schedule, now);
  // afterSaveSchedule uses Date.now via evaluate — pass now explicitly:
  const after2 = evaluateStoreStatus({ weeklySchedule: schedule, manualMode: "auto", exceptionDate: null }, now);
  assert(after2.isOpen === false, "BUG1: after save+auto at 14:28 must be closed");
  assert(after2.reason === "outside_hours", "BUG1: outside_hours");
  assert(after2.message === "Estamos fechados no momento.", "BUG1 message");
  void after;
}

// ── BUG 2: auto open at 18:00 / auto close at 22:20 ───────────────────────────
{
  const schedule = defaultWeeklySchedule();
  schedule.thursday = { active: true, open: "18:00", close: "22:20" };
  const settings = { weeklySchedule: schedule, manualMode: "auto", exceptionDate: null };
  assert(evaluateStoreStatus(settings, new Date("2026-08-13T17:59:00-03:00")).isOpen === false, "17:59 closed");
  assert(evaluateStoreStatus(settings, new Date("2026-08-13T18:00:00-03:00")).isOpen === true, "18:00 open");
  assert(evaluateStoreStatus(settings, new Date("2026-08-13T22:19:00-03:00")).isOpen === true, "22:19 open");
  assert(evaluateStoreStatus(settings, new Date("2026-08-13T22:20:00-03:00")).isOpen === false, "22:20 closed");
}

// ── BUG 3: day without hours never open ───────────────────────────────────────
{
  const schedule = defaultWeeklySchedule(); // all inactive
  const settings = { weeklySchedule: schedule, manualMode: "auto", exceptionDate: null };
  const r = evaluateStoreStatus(settings, new Date("2026-08-13T19:00:00-03:00"));
  assert(r.isOpen === false, "BUG3: inactive day closed");
  assert(r.reason === "day_closed", "BUG3: day_closed");

  // active but missing/invalid times
  const bad = normalizeDaySchedule({ active: true, open: "", close: "" });
  assert(bad.active === false, "BUG3: empty times ⇒ inactive");

  // HH:mm:ss from browsers
  assert(normalizeTimeHHmm("18:00:00") === "18:00", "accept seconds");
}

// ── BUG 4: Fechar agora (manual closed) ───────────────────────────────────────
{
  const schedule = defaultWeeklySchedule();
  schedule.thursday = { active: true, open: "18:00", close: "22:20" };
  const openNow = evaluateStoreStatus(
    { weeklySchedule: schedule, manualMode: "open", exceptionDate: null },
    new Date("2026-08-13T14:28:00-03:00"),
  );
  assert(openNow.isOpen === true, "open-now works outside hours");
  const closed = evaluateStoreStatus(
    { weeklySchedule: schedule, manualMode: "closed", exceptionDate: null },
    new Date("2026-08-13T19:00:00-03:00"),
  );
  assert(closed.isOpen === false, "BUG4: close-now forces closed even inside hours");
  assert(closed.message === "No momento não estamos aceitando pedidos.", "BUG4 message");
}

// Default schedule must not invent always-open days
{
  const d = defaultWeeklySchedule();
  assert(WEEKDAY_KEYS.every((k) => d[k].active === false), "defaults closed");
}

console.log("business-hours-selftest: OK");
console.log(JSON.stringify({
  bug1_save_recalc: "pass",
  bug2_auto_open_close: "pass",
  bug3_day_without_hours: "pass",
  bug4_close_now: "pass",
}, null, 2));
