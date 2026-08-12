/**
 * Live selftest for deliveryAreas resolve logic (bundled from TS).
 * Usage: node scripts/delivery-areas-resolve-selftest.mjs
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const entry = path.join(root, "artifacts/api-server/src/lib/deliveryAreas.ts");
const require = createRequire(import.meta.url);
const esbuild = require(path.join(root, "artifacts/api-server/node_modules/esbuild"));
const outfile = "/tmp/delivery-areas-resolve-selftest.mjs";

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  packages: "external",
});

const mod = await import(`file://${outfile}`);
const { pointInPolygon, resolvePointInAreas, calcAreaFee, OUTSIDE_AREA_MSG } = mod;

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

try { fs.unlinkSync(outfile); } catch { /* ignore */ }
console.log("delivery-areas-resolve-selftest: PASS");
