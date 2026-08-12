/**
 * Contract: Áreas de Entrega must keep a fixed React sibling tree (no insertBefore).
 * Usage: node scripts/delivery-areas-dom-selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "artifacts/burger-gn/src/pages/admin/DeliveryAreasAdmin.tsx");
const kmPath = path.join(root, "artifacts/burger-gn/src/pages/admin/KmDelivery.tsx");
const page = fs.readFileSync(pagePath, "utf8");
const km = fs.readFileSync(kmPath, "utf8");
const pageCode = page
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

function must(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

must(page.includes("stable React DOM"), "documents stable DOM contract");
must(page.includes("insertBefore"), "mentions insertBefore root cause");
must(pageCode.includes("invisible"), "uses invisible for stable status/drawing rows");
must(pageCode.includes('showForm ? "" : "hidden"') || pageCode.includes("showForm ? '' : 'hidden'"), "form toggled via hidden");
must(pageCode.includes("showCancel ? \"\" : \"invisible") || pageCode.includes("showCancel ? '' : 'invisible"), "cancel button stays mounted");
must(!pageCode.match(/\{error\s*&&\s*\(/), "no conditional error mount");
must(!pageCode.match(/\{success\s*&&\s*\(/), "no conditional success mount");
must(!pageCode.match(/\{drawing\s*&&\s*\(/), "no conditional drawing banner mount");
must(!pageCode.match(/loading\s*\?\s*\(/), "no loading ternary swap");
must(pageCode.includes("refresh({ silent: true })") || pageCode.includes('refresh({ silent: true })'), "silent refresh after save");
must(pageCode.includes("deferLeaflet") || pageCode.includes("requestAnimationFrame"), "defers Leaflet mutations");
must(km.includes("areasMounted"), "KmDelivery keeps areas mounted after first visit");
must(km.includes("tab === 'areas' ? '' : 'hidden'") || km.includes('tab === "areas" ? "" : "hidden"') || km.includes("tab === 'areas' ? '' : \"hidden\""), "areas panel CSS hidden");
must(!km.match(/tab === 'areas' \? \(\s*<DeliveryAreasAdmin/), "no ternary unmount of DeliveryAreasAdmin on tab switch");

console.log("delivery-areas-dom-selftest: PASS");
