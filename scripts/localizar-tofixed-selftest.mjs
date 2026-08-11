/**
 * Regression: string/null lat/lng must not reach .toFixed() in render.
 * Usage: node scripts/localizar-tofixed-selftest.mjs
 */

function toFiniteNumber(value) {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

function fmtCoord(value) {
  const n = toFiniteNumber(value);
  return n == null ? "—" : n.toFixed(5);
}

function normalizeGeocodeCandidate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const c = raw;
  const lat = typeof c.lat === "number" ? c.lat : parseFloat(String(c.lat ?? ""));
  const lng = typeof c.lng === "number" ? c.lng : parseFloat(String(c.lng ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: String(c.id ?? `${lat.toFixed(5)},${lng.toFixed(5)}`),
    lat,
    lng,
    streetName: String(c.streetName ?? ""),
    neighborhood: String(c.neighborhood ?? ""),
    city: String(c.city ?? ""),
    displayName: String(c.displayName ?? ""),
  };
}

// 1) Prove the OLD bug (render called .toFixed on possibly-string coords)
let oldThrew = false;
try {
  const lat = "-12.9002505";
  lat.toFixed(5);
} catch (e) {
  oldThrew = true;
  console.log("ok: root cause TypeError =", e.message);
}
if (!oldThrew) {
  console.error("FAIL: expected string.toFixed to throw");
  process.exit(1);
}

// 2) Fixed path: normalize then format
const normalized = normalizeGeocodeCandidate({
  id: 1,
  lat: "-12.9002505",
  lng: "-38.3146688",
  streetName: "Rua São Mateus",
  neighborhood: "Centro",
  city: "Lauro de Freitas",
  displayName: { nested: true },
});
if (!normalized || typeof normalized.lat !== "number" || typeof normalized.lng !== "number") {
  console.error("FAIL: lat/lng not numbers", normalized);
  process.exit(1);
}
if (typeof normalized.displayName !== "string") {
  console.error("FAIL: displayName not string", normalized);
  process.exit(1);
}
const formatted = `${fmtCoord(normalized.lat)}, ${fmtCoord(normalized.lng)}`;
if (formatted !== "-12.90025, -38.31467") {
  console.error("FAIL: fmtCoord output", formatted);
  process.exit(1);
}

// 3) Invalid coords rejected (do not enter createCoords state)
if (normalizeGeocodeCandidate({ lat: "abc", lng: "-38.3" }) !== null) {
  console.error("FAIL: expected null for invalid lat");
  process.exit(1);
}

console.log("ok: normalized coords safe for render:", formatted);
console.log("PASS");
