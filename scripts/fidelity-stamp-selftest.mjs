/**
 * Sanity checks for Clube fidelity 24h stamp cooldown helpers.
 * Run: node scripts/fidelity-stamp-selftest.mjs
 */

const FIDELITY_STAMP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function lastFidelityStampAt(meta) {
  for (const entry of meta.ledger ?? []) {
    if (entry.type === "selo_pedido" && entry.at) return entry.at;
  }
  return null;
}

function nextFidelityStampAvailableAt(meta, nowMs = Date.now()) {
  const last = lastFidelityStampAt(meta);
  if (!last) return null;
  const next = new Date(last).getTime() + FIDELITY_STAMP_COOLDOWN_MS;
  if (!Number.isFinite(next)) return null;
  if (nowMs >= next) return null;
  return new Date(next).toISOString();
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

const t0 = Date.parse("2026-08-11T10:00:00.000Z");
const meta = {
  ledger: [{ type: "selo_pedido", at: "2026-08-11T10:00:00.000Z" }],
};

assert(!canAwardFidelityStamp(meta, t0 + 1 * 3600_000), "blocked at +1h");
assert(!canAwardFidelityStamp(meta, t0 + 14 * 3600_000), "blocked at +14h");
assert(canAwardFidelityStamp(meta, t0 + 24 * 3600_000), "allowed at +24h");
assert(canAwardFidelityStamp(meta, t0 + 30 * 24 * 3600_000), "allowed after many days");
assert(canAwardFidelityStamp({ ledger: [] }, t0), "first stamp always allowed");

assert(isFidelityFreeBurgerProduct({ categorySlug: "hamburguer-artesanal", productName: "GN Classic" }), "burger ok");
assert(isFidelityFreeBurgerProduct({ categorySlug: "smash", productName: "Smash Duplo" }), "smash ok");
assert(!isFidelityFreeBurgerProduct({ categorySlug: "combos-burger-gn", productName: "Combo GN" }), "combo blocked");

console.log("fidelity-stamp-selftest: OK");
