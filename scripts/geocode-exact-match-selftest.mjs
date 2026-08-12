/**
 * Contract + live selftest for exact-match Localizar Endereço.
 * Usage: node scripts/geocode-exact-match-selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const geoPath = path.join(root, "artifacts/api-server/src/lib/geocodeStreets.ts");
const routePath = path.join(root, "artifacts/api-server/src/routes/delivery_streets.ts");
const apiPath = path.join(root, "artifacts/burger-gn/src/lib/api.ts");
const pagePath = path.join(root, "artifacts/burger-gn/src/pages/admin/RuasEntrega.tsx");

function mustInclude(file, needle, label) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes(needle)) {
    throw new Error(`FAIL [${label}]: missing ${JSON.stringify(needle)} in ${path.relative(root, file)}`);
  }
}

function normalizePt(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripStreetType(street) {
  return String(street || "")
    .replace(/^(rua|r\.?|avenida|av\.?|travessa|tv\.?|alameda|al\.?|estrada|rodovia|rod\.?)\s+/i, "")
    .trim();
}

function isExactStreetName(road, streetQuery) {
  const q = normalizePt(stripStreetType(streetQuery));
  const r = normalizePt(stripStreetType(road));
  if (!q || !r) return false;
  if (q === r) return true;
  return normalizePt(streetQuery) === normalizePt(road);
}

function neighborhoodMatches(candidateNeighborhood, filterNeighborhood) {
  if (!filterNeighborhood.trim()) return true;
  const c = normalizePt(candidateNeighborhood);
  const f = normalizePt(filterNeighborhood);
  if (!c) return false;
  return c === f || c.includes(f) || f.includes(c);
}

function cityMatches(candidateCity, filterCity) {
  if (!filterCity.trim()) return true;
  const c = normalizePt(candidateCity);
  const f = normalizePt(filterCity);
  return c === f || c.includes(f) || f.includes(c);
}

// ── Source contracts ──────────────────────────────────────────────────────────
mustInclude(geoPath, 'ADDRESS_NOT_FOUND_MSG = "Endereço não encontrado"', "msg");
mustInclude(geoPath, "similar?: boolean", "similar-flag");
mustInclude(geoPath, "suggestions:", "suggestions-type");
mustInclude(geoPath, "exactNotFound", "exactNotFound");
mustInclude(geoPath, "mode: \"exact\"", "exact-mode");
mustInclude(routePath, "similar: body.similar === true", "route-similar");
mustInclude(apiPath, "similar: parts.similar === true", "api-similar");
mustInclude(apiPath, "exactNotFound", "api-exactNotFound");
mustInclude(pagePath, "Ver sugestões semelhantes", "ui-cta");
mustInclude(pagePath, "handleLocate(true)", "ui-similar-call");
mustInclude(pagePath, "Endereço não encontrado", "ui-msg");

// ── Pure match rules ──────────────────────────────────────────────────────────
const cases = [
  ["Rua Direta da Cachoeira", "Rua Direta da Cachoeira", true],
  ["Rua Direta da Cachoeira", "Rua Cachoeira", false],
  ["Rua das Flores", "Rua das Flores", true],
  ["Av. Santos Dumont", "Santos Dumont", true],
  ["Rua Santos Dumont", "Avenida Santos Dumont", true],
];
for (const [query, road, expect] of cases) {
  const got = isExactStreetName(road, query);
  if (got !== expect) {
    throw new Error(`FAIL exact: "${road}" vs "${query}" → ${got}, expected ${expect}`);
  }
}

if (neighborhoodMatches("Centro", "Caji")) {
  throw new Error("FAIL: Centro must not match Caji");
}
if (!neighborhoodMatches("Caji", "Caji")) {
  throw new Error("FAIL: Caji should match Caji");
}
if (cityMatches("Salvador", "Lauro de Freitas")) {
  throw new Error("FAIL: Salvador must not match Lauro de Freitas");
}

console.log("contract + pure match: OK");

// ── Live geocode via esbuild bundle of server module ──────────────────────────
async function runLive() {
  const require = createRequire(import.meta.url);
  let esbuild;
  try {
    esbuild = require(path.join(root, "artifacts/api-server/node_modules/esbuild"));
  } catch {
    try {
      esbuild = require("esbuild");
    } catch {
      console.warn("skip live: esbuild not installed");
      return;
    }
  }

  const outfile = "/tmp/geocode-exact-selftest.mjs";
  await esbuild.build({
    entryPoints: [geoPath],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    packages: "external",
  });

  const mod = await import(pathToFileUrl(outfile));
  const { geocodeStreetLocation, ADDRESS_NOT_FOUND_MSG } = mod;

  // Bug case: must NOT return Rua Cachoeira for Rua Direta da Cachoeira / Caji
  const miss = await geocodeStreetLocation({
    street: "Rua Direta da Cachoeira",
    neighborhood: "Caji",
    city: "Lauro de Freitas",
    similar: false,
  });
  if (miss.candidates.length > 0) {
    const bad = miss.candidates.find(
      (c) => !isExactStreetName(c.streetName, "Rua Direta da Cachoeira"),
    );
    if (bad) {
      throw new Error(`FAIL: returned non-exact street ${bad.streetName}`);
    }
  }
  if (miss.candidates.length === 0) {
    if (miss.message !== ADDRESS_NOT_FOUND_MSG) {
      throw new Error(`FAIL: expected "${ADDRESS_NOT_FOUND_MSG}", got ${JSON.stringify(miss.message)}`);
    }
    if (!miss.exactNotFound) throw new Error("FAIL: exactNotFound should be true");
    if (miss.suggestions.length > 0) {
      throw new Error("FAIL: suggestions must be empty unless similar requested");
    }
  }
  console.log("live exact miss (Direta da Cachoeira/Caji):", {
    candidates: miss.candidates.length,
    message: miss.message,
    exactNotFound: miss.exactNotFound,
  });

  const similar = await geocodeStreetLocation({
    street: "Rua Direta da Cachoeira",
    neighborhood: "Caji",
    city: "Lauro de Freitas",
    similar: true,
  });
  for (const c of [...similar.candidates, ...similar.suggestions]) {
    if (!cityMatches(c.city, "Lauro de Freitas")) {
      throw new Error(`FAIL similar: other city ${c.city}`);
    }
    if (!neighborhoodMatches(c.neighborhood, "Caji")) {
      throw new Error(`FAIL similar: other neighborhood ${c.neighborhood}`);
    }
  }
  console.log("live similar (Direta da Cachoeira/Caji):", {
    candidates: similar.candidates.length,
    suggestions: similar.suggestions.map((s) => s.streetName),
  });

  // Known good street (ViaCEP/Nominatim coverage)
  const flowers = await geocodeStreetLocation({
    street: "Rua das Flores",
    neighborhood: "Centro",
    city: "Lauro de Freitas",
    similar: false,
  });
  console.log("live exact (Rua das Flores/Centro):", {
    candidates: flowers.candidates.map((c) => `${c.streetName} — ${c.neighborhood}`),
    message: flowers.message,
  });
  if (flowers.candidates.length === 0) {
    throw new Error("FAIL: Rua das Flores / Centro should resolve exactly");
  }
  for (const c of flowers.candidates) {
    if (!isExactStreetName(c.streetName, "Rua das Flores")) {
      throw new Error(`FAIL: non-exact flower result ${c.streetName}`);
    }
    if (!neighborhoodMatches(c.neighborhood, "Centro")) {
      throw new Error(`FAIL: wrong neighborhood ${c.neighborhood}`);
    }
  }

  try {
    fs.unlinkSync(outfile);
  } catch {
    /* ignore */
  }
}

function pathToFileUrl(p) {
  const abs = path.resolve(p);
  return `file://${abs}`;
}

await runLive();
console.log("geocode-exact-match-selftest: PASS");
