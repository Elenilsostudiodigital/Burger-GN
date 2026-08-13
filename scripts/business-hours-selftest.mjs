/**
 * Pure logic selftest for business hours (no DB).
 * Run: node scripts/business-hours-selftest.mjs
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parseHHmmToMinutes(value) {
  const m = String(value).match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isWithinWindow(nowMinutes, open, close) {
  const openM = parseHHmmToMinutes(open);
  const closeM = parseHHmmToMinutes(close);
  if (openM == null || closeM == null) return false;
  if (openM === closeM) return true;
  if (closeM > openM) return nowMinutes >= openM && nowMinutes < closeM;
  return nowMinutes >= openM || nowMinutes < closeM;
}

function evaluate(settings, nowMinutes, dateIso, weekday) {
  if (settings.manualMode === "closed") {
    return { isOpen: false, reason: "manual_closed", message: "No momento não estamos aceitando pedidos." };
  }
  if (settings.manualMode === "open") {
    return { isOpen: true, reason: "manual_open", message: "Loja aberta" };
  }

  let day = settings.weeklySchedule[weekday];
  if (settings.exceptionDate === dateIso) {
    if (settings.exceptionClosed) {
      return { isOpen: false, reason: "exception_closed", message: "Estamos fechados no momento.", next: "18:00" };
    }
    day = { active: true, open: settings.exceptionOpen, close: settings.exceptionClose };
  }
  if (!day.active) {
    return { isOpen: false, reason: "day_closed", message: "Estamos fechados no momento.", nextLabel: "Voltaremos às 18:00" };
  }
  if (isWithinWindow(nowMinutes, day.open, day.close)) {
    return { isOpen: true, reason: "schedule_open", message: "Loja aberta" };
  }
  const next = nowMinutes < parseHHmmToMinutes(day.open) ? day.open : "18:00";
  return { isOpen: false, reason: "outside_hours", message: "Estamos fechados no momento.", nextLabel: `Voltaremos às ${next}` };
}

const schedule = {
  monday: { active: true, open: "18:00", close: "23:00" },
  tuesday: { active: true, open: "18:00", close: "23:00" },
  wednesday: { active: true, open: "18:00", close: "23:00" },
  thursday: { active: true, open: "18:00", close: "23:00" },
  friday: { active: true, open: "18:00", close: "23:00" },
  saturday: { active: true, open: "18:00", close: "23:00" },
  sunday: { active: false, open: "18:00", close: "23:00" },
};

// open by schedule
{
  const r = evaluate({ manualMode: "auto", weeklySchedule: schedule, exceptionDate: null }, 19 * 60, "2026-08-13", "thursday");
  assert(r.isOpen && r.reason === "schedule_open", "should be open at 19:00 Thu");
}

// closed outside hours
{
  const r = evaluate({ manualMode: "auto", weeklySchedule: schedule, exceptionDate: null }, 14 * 60, "2026-08-13", "thursday");
  assert(!r.isOpen && r.reason === "outside_hours", "should be closed at 14:00");
  assert(r.message === "Estamos fechados no momento.", "outside hours message");
  assert(r.nextLabel === "Voltaremos às 18:00", "next open label");
}

// sunday closed
{
  const r = evaluate({ manualMode: "auto", weeklySchedule: schedule, exceptionDate: null }, 19 * 60, "2026-08-16", "sunday");
  assert(!r.isOpen && r.reason === "day_closed", "sunday closed");
}

// manual close overrides open hours
{
  const r = evaluate({ manualMode: "closed", weeklySchedule: schedule, exceptionDate: null }, 19 * 60, "2026-08-13", "thursday");
  assert(!r.isOpen && r.reason === "manual_closed", "manual close");
  assert(r.message === "No momento não estamos aceitando pedidos.", "manual message");
}

// manual open overrides closed day
{
  const r = evaluate({ manualMode: "open", weeklySchedule: schedule, exceptionDate: null }, 10 * 60, "2026-08-16", "sunday");
  assert(r.isOpen && r.reason === "manual_open", "manual open");
}

// today exception closed
{
  const r = evaluate({
    manualMode: "auto",
    weeklySchedule: schedule,
    exceptionDate: "2026-08-13",
    exceptionClosed: true,
  }, 19 * 60, "2026-08-13", "thursday");
  assert(!r.isOpen && r.reason === "exception_closed", "exception closed");
}

// today exception special hours
{
  const r = evaluate({
    manualMode: "auto",
    weeklySchedule: schedule,
    exceptionDate: "2026-08-13",
    exceptionClosed: false,
    exceptionOpen: "19:30",
    exceptionClose: "22:00",
  }, 19 * 60, "2026-08-13", "thursday");
  assert(!r.isOpen && r.reason === "outside_hours", "before exception open");
  const r2 = evaluate({
    manualMode: "auto",
    weeklySchedule: schedule,
    exceptionDate: "2026-08-13",
    exceptionClosed: false,
    exceptionOpen: "19:30",
    exceptionClose: "22:00",
  }, 20 * 60, "2026-08-13", "thursday");
  assert(r2.isOpen && r2.reason === "schedule_open", "inside exception hours");
}

assert(isWithinWindow(23 * 60 + 30, "18:00", "02:00"), "overnight window late");
assert(isWithinWindow(60, "18:00", "02:00"), "overnight window early morning");
assert(!isWithinWindow(12 * 60, "18:00", "02:00"), "overnight window midday closed");

console.log("business-hours-selftest: OK");
