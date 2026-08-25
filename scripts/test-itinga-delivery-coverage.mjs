/**
 * Real-address coverage report for Itinga / Rua Direta da Cachoeira.
 * Usage: node scripts/test-itinga-delivery-coverage.mjs
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const esbuild = require(path.join(root, "artifacts/api-server/node_modules/esbuild"));
const outfile = path.join(os.tmpdir(), "test-itinga-delivery-coverage.mjs");

await esbuild.build({
  entryPoints: [path.join(root, "artifacts/api-server/src/lib/deliveryAreas.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  packages: "external",
});
const {
  pointInPolygon,
  resolvePointInAreas,
  evaluateDeliveryCoverage,
} = await import(pathToFileURL(outfile).href);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STORE = { lat: -12.88052027, lng: -38.35757007 };
const OSM_STREET = { lat: -12.8806323, lng: -38.3611402 };
const APPROVED_COORDS = { lat: -12.8806605, lng: -38.3572458 };

// Local stand-in of the production "Itinga" green area: contains the store
// and the approved-street pin; OSM street centerline sits just west.
const itingaPoly = {
  type: "Polygon",
  coordinates: [[
    [-38.3595, -12.8825],
    [-38.3555, -12.8825],
    [-38.3555, -12.8785],
    [-38.3595, -12.8785],
    [-38.3595, -12.8825],
  ]],
};
const itingaArea = {
  id: 10,
  companyId: 1,
  city: "Lauro de Freitas",
  name: "Itinga",
  color: "#22c55e",
  status: "active",
  enabled: true,
  blockReason: "",
  minFee: "5",
  feePerKm: "0",
  maxDistanceKm: null,
  notes: "",
  priority: 0,
  polygon: itingaPoly,
  bbox: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const report = [];
function log(line) {
  report.push(line);
  console.log(line);
}

log("=== Geocoding (checkout antigo vs novo) ===");
async function nominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=3&countrycodes=br&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "pt-BR", "User-Agent": "TheBurgerGN/1.0 (itinga-coverage-test)" },
  });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

const CAPTURED_OSM = {
  lat: OSM_STREET.lat,
  lng: OSM_STREET.lng,
  displayName:
    "Rua Direta da Cachoeira, Itinga, Salvador, Bahia, Northeast Region, 41502-203, Brazil",
};

let oldHits = [];
let newHits = [];
let liveGeocode = false;
try {
  const oldQuery = "Rua Direta da Cachoeira, 300, Itinga, Lauro de Freitas, Bahia, Brasil";
  const newQuery = "Rua Direta da Cachoeira, Itinga, Salvador, Bahia, Brasil";
  oldHits = await nominatim(oldQuery);
  await new Promise((r) => setTimeout(r, 1100));
  newHits = await nominatim(newQuery);
  liveGeocode = true;
} catch (err) {
  log(`Nominatim live fetch indisponível neste ambiente (${err?.cause?.code || err.message}).`);
  log("Usando coordenadas OSM já capturadas em 2026-08-24 para o restante do relatório.");
}

log(`Query antiga (só Lauro): ${liveGeocode ? oldHits.length : "(live falhou)"} resultado(s)`);
if (oldHits[0]) log(`  → ${oldHits[0].lat}, ${oldHits[0].lon} | ${oldHits[0].display_name}`);
log(`Query nova (Salvador/Itinga): ${liveGeocode ? newHits.length : "(live falhou)"} resultado(s)`);
if (newHits[0]) {
  log(`  → ${newHits[0].lat}, ${newHits[0].lon} | ${newHits[0].display_name}`);
}
if (liveGeocode) {
  assert(oldHits.length === 0, "causa geocode: query só Lauro deve falhar para esta rua");
  assert(newHits.length > 0, "geocode novo deve encontrar Rua Direta da Cachoeira");
}

const found = newHits[0]
  ? {
      lat: parseFloat(newHits[0].lat),
      lng: parseFloat(newHits[0].lon),
      displayName: newHits[0].display_name,
    }
  : CAPTURED_OSM;
const distStoreToOsm = haversine(STORE.lat, STORE.lng, found.lat, found.lng);
log(`Distância loja → rua OSM: ${distStoreToOsm.toFixed(3)} km`);

log("\n=== Ponto dentro / borda / fora (polígono local equivalente) ===");
assert(pointInPolygon(STORE.lng, STORE.lat, itingaPoly), "loja deve estar dentro");
assert(pointInPolygon(APPROVED_COORDS.lng, APPROVED_COORDS.lat, itingaPoly), "pin aprovado deve estar dentro");
assert(!pointInPolygon(OSM_STREET.lng, OSM_STREET.lat, itingaPoly), "centerline OSM desta rua fica a oeste do polígono da loja");

const inside = evaluateDeliveryCoverage({
  areasEnabled: true,
  areas: [itingaArea],
  lat: STORE.lat,
  lng: STORE.lng,
  baseLat: STORE.lat,
  baseLng: STORE.lng,
  knownStreet: null,
});
log(`Dentro (loja), rua desconhecida → status=${inside.status} source=${inside.source} canRequest=${inside.canRequest} fee=${inside.fee}`);
assert(inside.status === "allowed" && inside.inDeliveryArea && inside.canRequest === false, "dentro da área verde = entrega automática");

const westLng = itingaPoly.coordinates[0][0][0];
const westLat = -12.8805;
const border = resolvePointInAreas({
  areasEnabled: true,
  areas: [itingaArea],
  lat: westLat,
  lng: westLng,
  baseLat: STORE.lat,
  baseLng: STORE.lng,
});
log(`Borda oeste (${westLat}, ${westLng}) → status=${border.status}`);
assert(border.status === "allowed", "ponto exatamente na borda deve ser atendido");

const outside = evaluateDeliveryCoverage({
  areasEnabled: true,
  areas: [itingaArea],
  lat: OSM_STREET.lat,
  lng: OSM_STREET.lng,
  baseLat: STORE.lat,
  baseLng: STORE.lng,
  knownStreet: null,
});
log(`Fora (OSM street), rua desconhecida → status=${outside.status} canRequest=${outside.canRequest}`);
assert(outside.status === "outside" && outside.canRequest === true, "fora da área = solicitar análise");

const afterApproval = evaluateDeliveryCoverage({
  areasEnabled: true,
  areas: [itingaArea],
  lat: OSM_STREET.lat,
  lng: OSM_STREET.lng,
  baseLat: STORE.lat,
  baseLng: STORE.lng,
  knownStreet: { active: true, fee: 5, distanceKm: 0.39, etaMinutes: 10 },
});
log(`Fora + rua aprovada → status=${afterApproval.status} source=${afterApproval.source} fee=${afterApproval.fee}`);
assert(afterApproval.status === "allowed" && afterApproval.source === "street", "após aprovação deve entregar mesmo fora do polígono");

const noGeoApproved = evaluateDeliveryCoverage({
  areasEnabled: true,
  areas: [itingaArea],
  lat: null,
  lng: null,
  baseLat: STORE.lat,
  baseLng: STORE.lng,
  knownStreet: { active: true, fee: 5, distanceKm: 3.6, etaMinutes: 15 },
});
log(`Sem geocode + rua aprovada → status=${noGeoApproved.status} source=${noGeoApproved.source}`);
assert(noGeoApproved.status === "allowed", "aprovação não pode depender de geocode posterior");

log("\n=== Decisão final simulada (Rua Direta da Cachoeira / Quinta da Glória) ===");
log(`Localização OSM: ${found.displayName}`);
log(`Coordenadas: ${found.lat}, ${found.lng}`);
log(`Dentro da área verde desenhada ao redor da loja: ${pointInPolygon(found.lng, found.lat, itingaPoly) ? "sim" : "não"}`);
log(`Com rua já aprovada no cadastro: entrega LIBERADA (source=street, taxa da rua)`);
log(`Sem rua aprovada: solicitar análise (ponto OSM ~${distStoreToOsm.toFixed(2)} km a oeste da loja)`);

try { fs.unlinkSync(outfile); } catch { /* ignore */ }
console.log("\ntest-itinga-delivery-coverage: PASS");
