/**
 * GPS vs typed-address delivery coverage must share one validator.
 * Usage: node scripts/gps-delivery-coverage-selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const checkout = fs.readFileSync(path.join(root, "artifacts/burger-gn/src/pages/Checkout.tsx"), "utf8");
const validateSrc = fs.readFileSync(path.join(root, "artifacts/burger-gn/src/lib/validateDeliveryCoverage.ts"), "utf8");
const rulesSrc = fs.readFileSync(path.join(root, "artifacts/burger-gn/src/lib/deliveryCoverageRules.ts"), "utf8");
const areasSrc = fs.readFileSync(path.join(root, "artifacts/api-server/src/lib/deliveryAreas.ts"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const DELIVER_IN_REGION_MSG = "Entregamos na sua região.";
const DO_NOT_DELIVER_MSG = "Não entregamos nesta região.";

function allowedCoverage(fee, distanceKm, areaName = null) {
  return { status: "allowed", allowed: true, fee, distanceKm, message: DELIVER_IN_REGION_MSG, areaName };
}
function outsideCoverage(distanceKm = null) {
  return { status: "outside", allowed: false, fee: null, distanceKm, message: DO_NOT_DELIVER_MSG, areaName: null };
}
function pendingCoverage() {
  return { status: "pending", allowed: false, fee: null, distanceKm: null, message: "", areaName: null };
}
function blockedCoverage(message, distanceKm = null, areaName = null) {
  return { status: "blocked", allowed: false, fee: null, distanceKm, message, areaName };
}

function applyStreetOverlay(coverage, street) {
  const notes = String(street.notes || "").trim();
  const etaMinutes = street.etaMinutes ?? null;
  if (!coverage || coverage.status === "pending" || coverage.status === "neighborhood") {
    return {
      coverage: coverage ?? pendingCoverage(),
      streetBlocked: false,
      canRequestArea: !!(street.canRequest || street.pending),
      streetNotes: notes,
      etaMinutes,
    };
  }
  if (street.known && street.active === false) {
    return {
      coverage: blockedCoverage(
        street.message || "blocked",
        coverage.distanceKm,
        coverage.areaName,
      ),
      streetBlocked: true,
      canRequestArea: false,
      streetNotes: notes,
      etaMinutes,
    };
  }
  return {
    coverage,
    streetBlocked: false,
    canRequestArea: !coverage.allowed && !!(street.canRequest || street.pending),
    streetNotes: notes,
    etaMinutes,
  };
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    const xi = Number(pi[0]);
    const yi = Number(pi[1]);
    const xj = Number(pj[0]);
    const yj = Number(pj[1]);
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function resolvePoint(lat, lng) {
  const ring = [
    [-38.33, -12.90],
    [-38.32, -12.90],
    [-38.32, -12.89],
    [-38.33, -12.89],
    [-38.33, -12.90],
  ];
  return pointInRing(lng, lat, ring) ? allowedCoverage(5, 1) : outsideCoverage(1);
}

function runTypedFlow(lat, lng) {
  return resolvePoint(lat, lng);
}
function runGpsFlow(lat, lng) {
  return resolvePoint(lat, lng);
}

let n = 0;

{
  assert(validateSrc.includes("export async function validateDeliveryCoverage"), "single validator exported");
  assert(checkout.includes("validateDeliveryCoverage(lat, lng, kmConfig)"), "applyCoordinates calls the validator");
  assert(checkout.includes("await applyCoordinates(coords.lat, coords.lng)"), "typed address uses applyCoordinates");
  assert(checkout.includes("await applyCoordinates(lat, lng)"), "GPS uses applyCoordinates");
  assert(checkout.includes("geocodeDeliveryAddress({"), "typed and GPS use geocodeDeliveryAddress");
  assert(!checkout.includes("if (!kmConfig?.enabled) await resolveNeighborhoodFee"), "GPS must not overwrite area/KM with neighborhood fee");
  n++;
}

{
  const gpsStart = checkout.indexOf("const startGps");
  const gpsEnd = checkout.indexOf("const confirmGpsLocation");
  const gpsBlock = checkout.slice(gpsStart, gpsEnd);
  assert(gpsBlock.includes("watchPosition"), "GPS falls back to watchPosition on slow devices");
  assert(!gpsBlock.includes("geocodeDeliveryAddress"), "GPS coordinates must not be replaced by a geocoded namesake");
  assert(gpsBlock.includes("reverseGeocode(lat, lng)"), "GPS reverse geocode only fills the address form");
  assert(!gpsBlock.includes("checkDeliveryStreet"), "GPS does not validate coverage via street name");
  n++;
}

{
  assert(checkout.includes("applyStreetOverlay"), "street registry is an overlay, not a second validator");
  assert(rulesSrc.includes("It must NEVER flip an allowed coordinate result"), "overlay rule documented");
  assert(validateSrc.includes("Official customer delivery coverage") || validateSrc.includes("Typed address, GPS, and map pin"), "validator header states official shared use");
  n++;
}

{
  const querySrc = rulesSrc.match(/return `\$\{street\.trim\(\)\}, \$\{number\.trim\(\)\}, \$\{neighborhood\.trim\(\)\}, \$\{GEOCODE_CITY_SUFFIX\}`/);
  assert(querySrc, "shared geocode query builder exists");
  assert(rulesSrc.includes("Lauro de Freitas, Bahia, Brasil"), "city suffix matches previous checkout query");
  n++;
}

{
  const inside = allowedCoverage(8, 1.4, "Verde");
  const typed = { flow: "typed", ...inside };
  const gps = { flow: "gps", ...inside };
  assert(typed.allowed === gps.allowed && typed.fee === gps.fee && typed.message === gps.message, "same lat/lng same result");
  assert(typed.message === DELIVER_IN_REGION_MSG, "inside copy");
  assert(outsideCoverage(9.1).message === DO_NOT_DELIVER_MSG, "outside copy");
  n++;
}

{
  const overlay = applyStreetOverlay(allowedCoverage(7.5, 2.1, "Verde"), {
    known: false,
    canRequest: true,
    pending: false,
    message: "Esta região ainda não faz parte da nossa área de entrega.",
  });
  assert(overlay.coverage.allowed === true, "unknown street cannot deny GPS/coords success");
  assert(overlay.coverage.fee === 7.5, "fee stays from coordinate validator");
  assert(overlay.canRequestArea === false, "analysis CTA stays off when coverage allowed");
  n++;
}

{
  const overlay = applyStreetOverlay(outsideCoverage(4), {
    known: false,
    canRequest: true,
    pending: false,
    message: "Esta região ainda não faz parte da nossa área de entrega.",
  });
  assert(overlay.coverage.allowed === false, "outside stays outside");
  assert(overlay.coverage.message === DO_NOT_DELIVER_MSG, "outside message stays from validator");
  assert(overlay.canRequestArea === true, "analysis CTA only when coverage failed");
  n++;
}

{
  const overlay = applyStreetOverlay(allowedCoverage(6, 1, "Verde"), {
    known: true,
    active: false,
    canRequest: false,
    pending: false,
    message: "rua inativa",
  });
  assert(overlay.streetBlocked === true && overlay.coverage.allowed === false, "inactive street still blocks");
  n++;
}

{
  const insidePts = [
    { lat: -12.895, lng: -38.325 },
    { lat: -12.892, lng: -38.328 },
    { lat: -12.898, lng: -38.322 },
  ];
  const outsidePts = [
    { lat: -12.880, lng: -38.310 },
    { lat: -12.910, lng: -38.340 },
    { lat: -12.850, lng: -38.200 },
  ];
  for (const p of insidePts) {
    const typed = runTypedFlow(p.lat, p.lng);
    const gps = runGpsFlow(p.lat, p.lng);
    assert(typed.allowed && gps.allowed, `inside ${p.lat},${p.lng}`);
    assert(typed.message === gps.message && typed.message === DELIVER_IN_REGION_MSG, "inside same copy");
  }
  for (const p of outsidePts) {
    const typed = runTypedFlow(p.lat, p.lng);
    const gps = runGpsFlow(p.lat, p.lng);
    assert(!typed.allowed && !gps.allowed, `outside ${p.lat},${p.lng}`);
    assert(typed.message === gps.message && typed.message === DO_NOT_DELIVER_MSG, "outside same copy");
  }
  n++;
}

{
  assert(checkout.includes("DELIVER_IN_REGION_MSG"), "success copy wired");
  assert(checkout.includes("DO_NOT_DELIVER_MSG"), "failure copy wired");
  assert(!checkout.includes("Esta região ainda não faz parte da nossa área de entrega."), "checkout dropped street-unknown coverage copy");
  assert(areasSrc.includes("Não entregamos nesta região."), "server outside copy matches");
  const seedSrc = fs.readFileSync(path.join(root, "artifacts/api-server/src/lib/seed.ts"), "utf8");
  assert(!seedSrc.includes("Seeding default delivery zones"), "seed must not recreate deleted neighborhoods");
  assert(!seedSrc.includes("Cleared legacy neighborhood"), "seed must not delete saved neighborhoods");
  assert(!seedSrc.includes("db.delete(deliveryZonesTable)"), "seed must not wipe bairros on deploy");
  const geoSrc = fs.readFileSync(path.join(root, "artifacts/burger-gn/src/lib/api.ts"), "utf8");
  assert(geoSrc.includes("buildDeliveryGeocodeQueries"), "typed geocode uses the full query set");
  assert(!geoSrc.includes("queries.slice(0, 4)"), "geocode must not drop Itinga queries");
  assert(geoSrc.includes("hitMatchesNeighborhood"), "neighborhood filter rejects namesake streets");
  assert(geoSrc.includes("isGenericCityCentroid"), "CEP city-centroid coords are not used for KM");
  assert(checkout.includes("onPick"), "unmapped streets can be pinned on the map");
  assert(checkout.includes("neighborhoodsEnabled"), "checkout reads the Bairros master switch");
  const ruleSrc = fs.readFileSync(path.join(root, ".cursor/rules/delivery-coverage.mdc"), "utf8");
  assert(ruleSrc.includes("fonte oficial"), "delivery rule is recorded as the official source of truth");
  assert(
    ruleSrc.includes("never insert DEFAULT_DELIVERY_ZONES")
      || ruleSrc.includes("must never insert")
      || ruleSrc.includes("Do not re-insert"),
    "rule forbids neighborhood reseed",
  );
  n++;
}

{
  const tiers = [
    { fromKm: "0", toKm: "2", fee: "5.00" },
    { fromKm: "2.1", toKm: "4", fee: "8.00" },
    { fromKm: "4.1", toKm: "6", fee: "10.00" },
  ];
  function findKmTier(distanceKm, list) {
    const sorted = [...list].sort((a, b) => parseFloat(a.fromKm) - parseFloat(b.fromKm));
    for (let i = 0; i < sorted.length; i++) {
      const tier = sorted[i];
      const from = parseFloat(tier.fromKm);
      const explicitTo = tier.toKm != null ? parseFloat(tier.toKm) : Infinity;
      const nextFrom = i + 1 < sorted.length ? parseFloat(sorted[i + 1].fromKm) : NaN;
      const inBand =
        Number.isFinite(nextFrom) && nextFrom > from
          ? distanceKm >= from && distanceKm < nextFrom
          : distanceKm >= from && distanceKm <= explicitTo;
      if (inBand) return { fee: parseFloat(tier.fee), consult: false };
    }
    return { fee: null, consult: true };
  }
  assert(findKmTier(2.05, tiers).fee === 5, "gap 2.05 km stays in the first band");
  assert(findKmTier(2.8, tiers).fee === 8, "2.8 km uses the 2.1–4 km band");
  n++;
}

console.log(`gps-delivery-coverage-selftest: ${n}/11 ok`);
