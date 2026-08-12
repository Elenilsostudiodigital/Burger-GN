/**
 * Contract: StreetMapPreview must keep a fixed React child tree (no iframe mount/unmount).
 * Usage: node scripts/localizar-map-dom-selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";

const previewPath = path.resolve("artifacts/burger-gn/src/components/StreetMapPreview.tsx");
const pagePath = path.resolve("artifacts/burger-gn/src/pages/admin/RuasEntrega.tsx");
const preview = fs.readFileSync(previewPath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");

// Strip block/line comments before DOM-API checks so docstrings don't false-fail.
const codeOnly = preview
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
    name: "iframe is always rendered (no conditional iframe branch)",
    ok: codeOnly.includes("<iframe") && !codeOnly.match(/\?\s*\(\s*<iframe/),
  },
  {
    name: "placeholder/loading use CSS visibility, not conditional null",
    ok:
      codeOnly.includes("invisible pointer-events-none") &&
      !codeOnly.match(/\{loading\s*\?\s*\(/) &&
      !codeOnly.match(/loading\s*\?\s*[\s\S]{0,80}:\s*null/),
  },
  {
    name: "uses about:blank when no coords (keeps iframe node)",
    ok: codeOnly.includes("about:blank"),
  },
  {
    name: "no Leaflet / react-leaflet imports or MapContainer/L.map",
    ok:
      !codeOnly.match(/from\s+['"]react-leaflet['"]/) &&
      !codeOnly.match(/from\s+['"]leaflet['"]/) &&
      !codeOnly.includes("MapContainer") &&
      !codeOnly.includes("L.map") &&
      !page.match(/from\s+['"]react-leaflet['"]/),
  },
  {
    name: "no direct DOM APIs in code (appendChild/removeChild/innerHTML/insertBefore)",
    ok:
      !codeOnly.includes("appendChild") &&
      !codeOnly.includes("removeChild") &&
      !codeOnly.includes("innerHTML") &&
      !codeOnly.includes("insertBefore"),
  },
  {
    name: "no useEffect/useMemo/useRef remounting map instance",
    ok: !codeOnly.includes("useEffect") && !codeOnly.includes("useMemo") && !codeOnly.includes("useRef"),
  },
  {
    name: "page does not clear createCoords at start of locate",
    ok: !page.match(/setGeoLoading\(true\);[\s\S]{0,220}setCreateCoords\(null\)/),
  },
];

let failed = false;
for (const c of checks) {
  console.log(`${c.ok ? "ok" : "FAIL"}: ${c.name}`);
  if (!c.ok) failed = true;
}
if (failed) process.exit(1);
console.log("PASS");
