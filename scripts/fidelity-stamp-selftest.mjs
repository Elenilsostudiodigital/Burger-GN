/**
 * Clube fidelity: 1 purchase stamp per America/Sao_Paulo calendar day.
 * Admin ajuste_selo changes balance but does not lock the day.
 * Run: node scripts/fidelity-stamp-selftest.mjs
 */

const FIDELITY_TZ = "America/Sao_Paulo";

function calendarDateSP(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FIDELITY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function nextCalendarDateSP(dayIso) {
  const noon = new Date(`${dayIso}T12:00:00-03:00`);
  return calendarDateSP(noon.getTime() + 24 * 60 * 60 * 1000);
}

function hasFidelityStampOnCalendarDay(meta, dayIso) {
  return (meta.ledger ?? []).some((entry) => {
    if (entry.type !== "selo_pedido" || !entry.at) return false;
    const at = Date.parse(entry.at);
    if (!Number.isFinite(at)) return false;
    return calendarDateSP(at) === dayIso;
  });
}

function nextFidelityStampAvailableAt(meta, nowMs = Date.now()) {
  const today = calendarDateSP(nowMs);
  if (!hasFidelityStampOnCalendarDay(meta, today)) return null;
  const tomorrow = nextCalendarDateSP(today);
  return new Date(`${tomorrow}T00:00:00-03:00`).toISOString();
}

function canAwardFidelityStamp(meta, nowMs = Date.now()) {
  return nextFidelityStampAvailableAt(meta, nowMs) == null;
}

function isFidelityFreeBurgerProduct(opts) {
  const norm = (v) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const slug = norm(opts.categorySlug);
  const catName = norm(opts.categoryName);
  const productName = norm(opts.productName);
  if (slug.includes("combo") || catName.includes("combo") || productName.includes("combo")) {
    return false;
  }
  return (
    slug.includes("hamburguer") ||
    slug.includes("burger") ||
    slug.includes("smash") ||
    catName.includes("hamburguer") ||
    catName.includes("burger") ||
    catName.includes("smash") ||
    productName.includes("hamburguer") ||
    productName.includes("smash")
  );
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// 2026-08-11 10:00 SP = 13:00 UTC
const t0 = Date.parse("2026-08-11T13:00:00.000Z");
const meta = {
  ledger: [{ type: "selo_pedido", at: "2026-08-11T13:00:00.000Z" }],
};

assert(!canAwardFidelityStamp(meta, t0 + 1 * 3600_000), "blocked later same SP day");
assert(!canAwardFidelityStamp(meta, t0 + 10 * 3600_000), "blocked evening same SP day");
// Next SP calendar day 00:00 = 2026-08-12T03:00:00.000Z
assert(canAwardFidelityStamp(meta, Date.parse("2026-08-12T03:00:00.000Z")), "allowed next SP day");
assert(canAwardFidelityStamp({ ledger: [] }, t0), "first stamp always allowed");

// Admin zeroing stamps must NOT unlock another purchase stamp the same day
const afterAdminZero = {
  ledger: [
    { type: "ajuste_selo", at: "2026-08-11T18:00:00.000Z", stampsDelta: -3 },
    { type: "selo_pedido", at: "2026-08-11T13:00:00.000Z" },
  ],
};
assert(!canAwardFidelityStamp(afterAdminZero, t0 + 6 * 3600_000), "admin zero does not unlock same day");
assert(canAwardFidelityStamp(afterAdminZero, Date.parse("2026-08-12T03:00:00.000Z")), "next day after admin zero");

assert(isFidelityFreeBurgerProduct({ categorySlug: "hamburguer-artesanal", productName: "GN Classic" }), "burger ok");
assert(isFidelityFreeBurgerProduct({ categorySlug: "smash", productName: "Smash Duplo" }), "smash ok");
assert(!isFidelityFreeBurgerProduct({ categorySlug: "combos-burger-gn", productName: "Combo GN" }), "combo blocked");

console.log("fidelity-stamp-selftest: OK");
