/**
 * Contract test: Localizar map host must not swap <iframe> with a spinner sibling.
 * The old ternary (geoLoading ? Loader : iframe) caused:
 *   NotFoundError: Failed to execute 'insertBefore' on 'Node'
 * Usage: node scripts/localizar-map-dom-selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";

const file = path.resolve("artifacts/burger-gn/src/pages/admin/RuasEntrega.tsx");
const src = fs.readFileSync(file, "utf8");

const checks = [
  {
    name: "StreetMapPreview component exists",
    ok: src.includes("function StreetMapPreview"),
  },
  {
    name: "loading is an overlay (absolute), not a ternary replacement for iframe",
    ok: src.includes("absolute inset-0") && src.includes("StreetMapPreview"),
  },
  {
    name: "create form uses StreetMapPreview (not inline iframe ternary)",
    ok: src.includes("<StreetMapPreview") && !src.match(/geoLoading\s*\?\s*\(\s*<Loader2[\s\S]*iframe/),
  },
  {
    name: "locate does not clear createCoords (keeps iframe mounted)",
    ok:
      src.includes("Keep previous map iframe mounted") &&
      !src.match(/setGeoLoading\(true\);[\s\S]{0,200}setCreateCoords\(null\)/),
  },
  {
    name: "no leaflet / react-leaflet import in this screen",
    ok:
      !src.match(/from\s+['"]react-leaflet['"]/) &&
      !src.match(/from\s+['"]leaflet['"]/) &&
      !src.includes("MapContainer"),
  },
];

let failed = false;
for (const c of checks) {
  console.log(`${c.ok ? "ok" : "FAIL"}: ${c.name}`);
  if (!c.ok) failed = true;
}
if (failed) process.exit(1);
console.log("PASS");
