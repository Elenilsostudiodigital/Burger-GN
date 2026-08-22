/**
 * Contract: StreetMapPreview uses Leaflet in a stable host (no iframe / no dead static OSM).
 * Usage: node scripts/localizar-map-dom-selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";

const previewPath = path.resolve("artifacts/burger-gn/src/components/StreetMapPreview.tsx");
const pagePath = path.resolve("artifacts/burger-gn/src/pages/admin/RuasEntrega.tsx");
const appPath = path.resolve("artifacts/burger-gn/src/App.tsx");
const preview = fs.readFileSync(previewPath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");
const app = fs.readFileSync(appPath, "utf8");

const codeOnly = preview
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const pageCode = page
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const checks = [
  {
    name: "StreetMapPreview module exists",
    ok: fs.existsSync(previewPath),
  },
  {
    name: "RuasEntrega imports StreetMapPreview module",
    ok: page.includes("from '../../components/StreetMapPreview'"),
  },
  {
    name: "no iframe in StreetMapPreview",
    ok: !codeOnly.includes("<iframe"),
  },
  {
    name: "no iframe in RuasEntrega page",
    ok: !pageCode.includes("<iframe"),
  },
  {
    name: "dead staticmap.openstreetmap.de removed",
    ok: !preview.includes("staticmap.openstreetmap.de"),
  },
  {
    name: "Leaflet map host via L.map + marker",
    ok:
      !!codeOnly.match(/from\s+['"]leaflet['"]/) &&
      codeOnly.includes("L.map") &&
      codeOnly.includes("L.marker"),
  },
  {
    name: "map / satellite toggle present",
    ok: codeOnly.includes('"map"') && codeOnly.includes('"satellite"'),
  },
  {
    name: "placeholder/loading use CSS visibility, not conditional null siblings",
    ok:
      codeOnly.includes("invisible pointer-events-none") &&
      !codeOnly.match(/loading\s*\?\s*\(/) &&
      !codeOnly.match(/loading\s*\?\s*[\s\S]{0,80}:\s*null/),
  },
  {
    name: "no direct DOM APIs appendChild/removeChild/insertBefore in component code",
    ok:
      !codeOnly.includes("appendChild") &&
      !codeOnly.includes("removeChild") &&
      !codeOnly.includes("insertBefore"),
  },
  {
    name: "page does not clear coords at start of locate",
    ok:
      !page.match(/setGeoLoading\(true\);[\s\S]{0,220}setCoords\(null\)/) &&
      !page.match(/setGeoLoading\(true\);[\s\S]{0,220}setCreateCoords\(null\)/),
  },
  {
    name: "create form toggled via CSS hidden (not conditional unmount of map)",
    ok: pageCode.includes("showForm ? '' : 'hidden'") || pageCode.includes('showForm ? "" : "hidden"'),
  },
  {
    name: "list/edit/pageError panels stay mounted (no ternary null siblings under main)",
    ok:
      !pageCode.match(/\{pageError\s*&&/) &&
      !pageCode.match(/\{editing\s*\?\s*\(/) &&
      !pageCode.match(/\{listLoading\s*\?\s*\(/) &&
      pageCode.includes("showEmptyList") &&
      pageCode.includes("showList"),
  },
  {
    name: "App uses stable AdminRuasEntregaRoute (no anonymous arrow wrapper)",
    ok:
      app.includes("function AdminRuasEntregaRoute") &&
      app.includes('path="/admin/ruas-entrega" component={AdminRuasEntregaRoute}') &&
      !app.match(/path="\/admin\/ruas-entrega"\s+component=\{\(\)\s*=>/),
  },
];

let failed = false;
for (const c of checks) {
  console.log(`${c.ok ? "ok" : "FAIL"}: ${c.name}`);
  if (!c.ok) failed = true;
}
if (failed) process.exit(1);
console.log("PASS");
