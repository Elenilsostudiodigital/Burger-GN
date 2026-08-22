/**
 * Contract: region-request map must render an embedded Leaflet map (no dead static OSM img service).
 * Usage: node scripts/test-region-request-map.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const preview = read("artifacts/burger-gn/src/components/StreetMapPreview.tsx");
const codeOnly = preview
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

assert.doesNotMatch(codeOnly, /<iframe/i, "must not use iframe");
assert.doesNotMatch(preview, /staticmap\.openstreetmap\.de/, "dead static map service must be removed");
assert.match(preview, /from ["']leaflet["']/);
assert.match(preview, /L\.map\(/);
assert.match(preview, /L\.marker\(/);
assert.match(preview, /tile\.openstreetmap\.org/);
assert.match(preview, /World_Imagery|satellite/i);
assert.match(preview, /setBase\("map"\)|base === "map"/);
assert.match(preview, /setBase\("satellite"\)|base === "satellite"/);
assert.match(preview, /Latitude/);
assert.match(preview, /Longitude/);
assert.match(preview, /address/);

const card = read("artifacts/burger-gn/src/components/AreaAnalysisRequestCard.tsx");
assert.match(card, /StreetMapPreview/);
assert.match(card, /address=\{addressLine\}/);
assert.match(card, /Aceitar/);
assert.match(card, /Recusar/);
assert.match(card, /approveStreetRequest/);
assert.match(card, /rejectStreetRequest/);

const novas = read("artifacts/burger-gn/src/pages/admin/NovasRuas.tsx");
assert.match(novas, /StreetMapPreview/);
assert.match(novas, /address=\{/);
assert.match(novas, /approveStreetRequest|handleApprove/);
assert.match(novas, /rejectStreetRequest|handleReject/);

// Accept/reject APIs untouched
const api = read("artifacts/burger-gn/src/lib/api.ts");
assert.match(api, /approveStreetRequest/);
assert.match(api, /rejectStreetRequest/);

console.log("test-region-request-map: ok");
