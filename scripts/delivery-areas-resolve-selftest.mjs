/**
 * Live selftest for deliveryAreas resolve logic (bundled from TS).
 * Usage: node scripts/delivery-areas-resolve-selftest.mjs
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const entry = path.join(root, "artifacts/api-server/src/lib/deliveryAreas.ts");
const require = createRequire(import.meta.url);
const esbuild = require(path.join(root, "artifacts/api-server/node_modules/esbuild"));
const outfile = path.join(os.tmpdir(), "delivery-areas-resolve-selftest.mjs");

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  packages: "external",
});

const mod = await import(pathToFileURL(outfile).href);
const {
  pointInPolygon,
  resolvePointInAreas,
  calcAreaFee,
  OUTSIDE_AREA_MSG,
  evaluateDeliveryCoverage,
  AREA_ANALYSIS_MSG,
} = mod;

const green = {
  id: 1,
  companyId: 1,
  city: "Lauro de Freitas",
  name: "Verde",
  color: "#22c55e",
  status: "active",
  enabled: true,
  blockReason: "",
  minFee: "5",
  feePerKm: "2",
  maxDistanceKm: null,
  notes: "",
  priority: 5,
  polygon: {
    type: "Polygon",
    coordinates: [[
      [-38.33, -12.90],
      [-38.32, -12.90],
      [-38.32, -12.89],
      [-38.33, -12.89],
      [-38.33, -12.90],
    ]],
  },
  bbox: [-38.33, -12.90, -38.32, -12.89],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const red = {
  ...green,
  id: 2,
  name: "Vermelha",
  color: "#ef4444",
  status: "blocked",
  priority: 0,
  blockReason: "Área de risco",
};

const yellow = {
  ...green,
  id: 3,
  name: "Amarela",
  color: "#eab308",
  minFee: "8",
  feePerKm: "3",
  priority: 1,
};

if (!pointInPolygon(-38.325, -12.895, green.polygon)) throw new Error("inside fail");
if (calcAreaFee(5, 2, 4) !== 8) throw new Error("fee fail");

const outside = resolvePointInAreas({
  areasEnabled: true,
  areas: [green],
  lat: -12.95,
  lng: -38.40,
  baseLat: -12.894,
  baseLng: -38.327,
});
if (outside.status !== "outside" || outside.message !== OUTSIDE_AREA_MSG) {
  throw new Error(`outside fail: ${JSON.stringify(outside)}`);
}

const blocked = resolvePointInAreas({
  areasEnabled: true,
  areas: [green, red],
  lat: -12.895,
  lng: -38.325,
  baseLat: -12.894,
  baseLng: -38.327,
});
if (blocked.status !== "blocked" || blocked.message !== "Área de risco") {
  throw new Error(`blocked fail: ${JSON.stringify(blocked)}`);
}

const allowed = resolvePointInAreas({
  areasEnabled: true,
  areas: [green, yellow],
  lat: -12.895,
  lng: -38.325,
  baseLat: -12.894,
  baseLng: -38.327,
});
if (allowed.status !== "allowed" || allowed.area?.name !== "Verde") {
  throw new Error(`allowed priority fail: ${JSON.stringify(allowed)}`);
}

const toggledOff = resolvePointInAreas({
  areasEnabled: true,
  areas: [{ ...green, enabled: false }],
  lat: -12.895,
  lng: -38.325,
  baseLat: -12.894,
  baseLng: -38.327,
});
if (toggledOff.status !== "outside") throw new Error("disabled area should be ignored");

const flagOff = resolvePointInAreas({
  areasEnabled: false,
  areas: [green],
  lat: -12.895,
  lng: -38.325,
  baseLat: -12.894,
  baseLng: -38.327,
});
if (flagOff.status !== "disabled") throw new Error("flag off fail");

// Boundary counts as inside
const westEdge = resolvePointInAreas({
  areasEnabled: true,
  areas: [green],
  lat: -12.895,
  lng: -38.33,
  baseLat: -12.894,
  baseLng: -38.327,
});
if (westEdge.status !== "allowed") throw new Error(`border fail: ${JSON.stringify(westEdge)}`);

// Stale bbox must not hide a point that is inside the polygon
const staleBbox = {
  ...green,
  bbox: [-38.325, -12.895, -38.324, -12.894], // too small, excludes real interior
};
const despiteStale = resolvePointInAreas({
  areasEnabled: true,
  areas: [staleBbox],
  lat: -12.895,
  lng: -38.328,
  baseLat: -12.894,
  baseLng: -38.327,
});
if (despiteStale.status !== "allowed") {
  throw new Error(`stale bbox false-negative: ${JSON.stringify(despiteStale)}`);
}

// Inside polygon + unknown street → automatic, no analysis
const insideUnknown = evaluateDeliveryCoverage({
  areasEnabled: true,
  areas: [green],
  lat: -12.895,
  lng: -38.325,
  baseLat: -12.894,
  baseLng: -38.327,
  knownStreet: null,
});
if (insideUnknown.status !== "allowed" || insideUnknown.canRequest !== false || !insideUnknown.inDeliveryArea) {
  throw new Error(`inside unknown should auto-allow: ${JSON.stringify(insideUnknown)}`);
}

// Outside polygon + approved street → allow after analysis
const outsideApproved = evaluateDeliveryCoverage({
  areasEnabled: true,
  areas: [green],
  lat: -12.95,
  lng: -38.40,
  baseLat: -12.894,
  baseLng: -38.327,
  knownStreet: { active: true, fee: 7, distanceKm: 4.2, etaMinutes: 15 },
});
if (outsideApproved.status !== "allowed" || outsideApproved.source !== "street" || outsideApproved.canRequest) {
  throw new Error(`approved street outside polygon should allow: ${JSON.stringify(outsideApproved)}`);
}

// Outside + unknown → request analysis
const outsideUnknown = evaluateDeliveryCoverage({
  areasEnabled: true,
  areas: [green],
  lat: -12.95,
  lng: -38.40,
  baseLat: -12.894,
  baseLng: -38.327,
  knownStreet: null,
});
if (outsideUnknown.status !== "outside" || outsideUnknown.canRequest !== true || outsideUnknown.message !== AREA_ANALYSIS_MSG) {
  throw new Error(`outside unknown should request analysis: ${JSON.stringify(outsideUnknown)}`);
}

// No coords + approved street → still allow (approval must stick)
const noCoordsApproved = evaluateDeliveryCoverage({
  areasEnabled: true,
  areas: [green],
  lat: null,
  lng: null,
  baseLat: -12.894,
  baseLng: -38.327,
  knownStreet: { active: true, fee: 5, distanceKm: 0.4, etaMinutes: 10 },
});
if (noCoordsApproved.status !== "allowed" || noCoordsApproved.source !== "street") {
  throw new Error(`approved street without geocode should allow: ${JSON.stringify(noCoordsApproved)}`);
}

const kmTiers = [
  { fromKm: "0", toKm: "2", fee: "5.00" },
  { fromKm: "2.1", toKm: "4", fee: "8.00" },
  { fromKm: "4.1", toKm: "6", fee: "10.00" },
];
const withKm = resolvePointInAreas({
  areasEnabled: true,
  areas: [green],
  lat: -12.895,
  lng: -38.325,
  baseLat: -12.870,
  baseLng: -38.325,
  kmTiers,
});
if (withKm.status !== "allowed") throw new Error(`km inside should allow: ${JSON.stringify(withKm)}`);
if (withKm.distanceKm == null || withKm.distanceKm < 2.1 || withKm.distanceKm >= 4.1) {
  throw new Error(`expected ~2.8 km, got ${withKm.distanceKm}`);
}
if (withKm.fee !== 8) {
  throw new Error(`2.8 km must use KM band R$ 8, got ${withKm.fee} (area minFee/feePerKm must not win)`);
}

const noTiers = resolvePointInAreas({
  areasEnabled: true,
  areas: [green],
  lat: -12.895,
  lng: -38.325,
  baseLat: -12.870,
  baseLng: -38.325,
});
if (noTiers.fee === 8) throw new Error("without KM tiers the area formula should still apply");

try { fs.unlinkSync(outfile); } catch { /* ignore */ }
console.log("delivery-areas-resolve-selftest: PASS");
