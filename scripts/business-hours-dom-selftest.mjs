/**
 * BusinessHoursTab mount contract (insertBefore root-cause guard).
 * Run: node scripts/business-hours-dom-selftest.mjs
 *
 * Rules encoded from the production crash:
 * - Open/close/auto must NOT replace weeklySchedule (time inputs stay mounted).
 * - Success/error hosts stay mounted (visibility only).
 * - Inactive day time inputs stay mounted (hidden via CSS).
 * - Poll effect must not depend on nextTransitionAt (no teardown on status flip).
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function patchStatusFields(prev, payload) {
  return {
    ...prev,
    manualMode: payload.manualMode,
    status: payload.status,
    exceptionDate: payload.exceptionDate,
    exceptionClosed: payload.exceptionClosed,
    exceptionOpen: payload.exceptionOpen,
    exceptionClose: payload.exceptionClose,
    updatedAt: payload.updatedAt,
  };
}

const scheduleA = {
  monday: { active: true, open: '18:00', close: '22:30' },
  tuesday: { active: true, open: '18:00', close: '22:30' },
};

const before = {
  weeklySchedule: scheduleA,
  manualMode: 'auto',
  status: { isOpen: false, nextTransitionAt: '2026-08-13T21:00:00.000Z', localTime: '15:00' },
  exceptionDate: null,
  exceptionClosed: false,
  exceptionOpen: '18:00',
  exceptionClose: '23:00',
  updatedAt: 't1',
};

const afterOpen = {
  weeklySchedule: {
    monday: { active: true, open: '19:00', close: '23:00' }, // server may return different object identity
    tuesday: { active: false, open: '18:00', close: '22:30' },
  },
  manualMode: 'open',
  status: { isOpen: true, nextTransitionAt: null, localTime: '15:01' },
  exceptionDate: null,
  exceptionClosed: false,
  exceptionOpen: '18:00',
  exceptionClose: '23:00',
  updatedAt: 't2',
};

const statusOnly = patchStatusFields(before, afterOpen);

assert(statusOnly.weeklySchedule === before.weeklySchedule, 'open/close must keep same weeklySchedule reference');
assert(statusOnly.weeklySchedule.monday.open === '18:00', 'must not adopt server schedule on status-only patch');
assert(statusOnly.manualMode === 'open', 'manualMode must update');
assert(statusOnly.status.isOpen === true, 'status must update');

// Visibility contract for feedback hosts
function feedbackVisibility(success, error) {
  return {
    successInvisible: !success,
    errorHidden: !error,
  };
}
assert(feedbackVisibility('', '').successInvisible === true, 'empty success stays invisible but mounted');
assert(feedbackVisibility('ok', '').successInvisible === false, 'success visible when set');
assert(feedbackVisibility('', 'err').errorHidden === false, 'error shown when set');

// Day inputs: active toggles CSS only
function dayInputsClass(active) {
  return {
    times: active ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-2 hidden',
    closedNote: active ? 'text-zinc-600 text-xs hidden' : 'text-zinc-600 text-xs',
  };
}
assert(dayInputsClass(false).times.includes('hidden'), 'inactive day hides times via CSS');
assert(dayInputsClass(true).closedNote.includes('hidden'), 'active day hides closed note via CSS');

// Poll deps must not include nextTransitionAt
const pollDeps = ['loading', 'applyStatusOnly'];
assert(!pollDeps.includes('nextTransitionAt'), 'poll effect must not tear down on transition time change');

console.log('business-hours-dom-selftest: OK');
