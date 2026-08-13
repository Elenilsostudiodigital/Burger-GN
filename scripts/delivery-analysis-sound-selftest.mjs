/**
 * Client-side acknowledgement of delivery-analysis alerts.
 * Sound plays once per request id per browser session; refresh must not replay.
 *
 * Run: node scripts/delivery-analysis-sound-selftest.mjs
 */

function loadHeard(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n) => typeof n === "number"));
  } catch {
    return new Set();
  }
}

function shouldPlay(heard, id, isInitialPageLoad) {
  if (heard.has(id)) return false;
  if (isInitialPageLoad) return false;
  return true;
}

function acknowledge(heard, id) {
  const next = new Set(heard);
  next.add(id);
  return next;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const empty = loadHeard(null);
assert(!shouldPlay(empty, 1, true), "initial load of existing pending must not play");
const afterLoad = acknowledge(empty, 1);
assert(!shouldPlay(afterLoad, 1, false), "refresh / later poll must not replay");
assert(shouldPlay(afterLoad, 2, false), "brand-new id after load must play");
const afterNew = acknowledge(afterLoad, 2);
assert(!shouldPlay(afterNew, 2, false), "same new id must not play twice");
assert(JSON.stringify([...afterNew].sort()) === JSON.stringify([1, 2]), "persist ids");

console.log("delivery-analysis-sound-selftest: OK");
