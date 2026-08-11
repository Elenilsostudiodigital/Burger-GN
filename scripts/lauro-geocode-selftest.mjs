/**
 * Selftest: geocoding restrito a Lauro de Freitas (viewbox + bounded + validação).
 * Uso: node scripts/lauro-geocode-selftest.mjs
 */
const VIEWBOX = "-38.4000,-12.7800,-38.2500,-12.9500";
const BBOX = { minLng: -38.4, maxLat: -12.78, maxLng: -38.25, minLat: -12.95 };

function normalizePt(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function inside(lat, lng) {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng;
}

function isLauro(addr, displayName) {
  const cityRaw = addr?.city || addr?.town || addr?.municipality || addr?.village || "";
  const stateRaw = addr?.state || "";
  const countryRaw = addr?.country || "";
  const countryCode = String(addr?.country_code || "").toLowerCase();
  const display = normalizePt(displayName);
  const cityOk = normalizePt(cityRaw).includes("lauro de freitas") || display.includes("lauro de freitas");
  const stateOk = !stateRaw ? display.includes("bahia") : ["bahia", "ba"].includes(normalizePt(stateRaw));
  const countryOk =
    countryCode === "br" ||
    normalizePt(countryRaw).includes("brasil") ||
    normalizePt(countryRaw).includes("brazil") ||
    display.includes("brasil");
  return cityOk && stateOk && countryOk;
}

function roadOf(addr) {
  return String(addr?.road || addr?.pedestrian || addr?.residential || addr?.street || "").trim();
}

function neighborhoodOf(addr) {
  return String(addr?.suburb || addr?.neighbourhood || addr?.city_district || addr?.quarter || "").trim();
}

function isPrecise(hit) {
  const road = roadOf(hit.address);
  if (!road) return false;
  if (hit.class === "boundary") return false;
  if (hit.class === "place" && ["suburb", "neighbourhood", "city", "municipality"].includes(hit.type)) return false;
  return hit.class === "highway" || Boolean(road);
}

async function search(q) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "10");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("viewbox", VIEWBOX);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("q", q);
  const res = await fetch(url, {
    headers: { "Accept-Language": "pt-BR", "User-Agent": "TheBurgerGN/1.0" },
  });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function roadMatchesQuery(road, streetQuery) {
  const r = normalizePt(road);
  const q = normalizePt(streetQuery).replace(/^(rua|r|avenida|av|travessa|tv|alameda|al|estrada|rodovia|rod)\s+/g, "");
  const rCore = r.replace(/^(rua|r|avenida|av|travessa|tv|alameda|al|estrada|rodovia|rod)\s+/g, "");
  if (!rCore || !q) return false;
  if (r.includes(q) || q.includes(rCore) || rCore.includes(q)) return true;
  const qTokens = q.split(" ").filter((t) => t.length >= 4);
  if (qTokens.length === 0) {
    const short = q.split(" ").filter((t) => t.length >= 3);
    return short.some((t) => rCore.includes(t));
  }
  const matched = qTokens.filter((t) => rCore.includes(t)).length;
  return matched >= Math.ceil(qTokens.length * 0.6);
}

function filterHits(hits, streetQuery) {
  const out = [];
  for (const hit of hits) {
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (!inside(lat, lng)) continue;
    if (!isLauro(hit.address, hit.display_name || "")) continue;
    if (!isPrecise(hit)) continue;
    const road = roadOf(hit.address);
    if (streetQuery && !roadMatchesQuery(road, streetQuery)) continue;
    out.push({
      road,
      neighborhood: neighborhoodOf(hit.address),
      city: hit.address?.city || hit.address?.municipality || "",
      lat,
      lng,
    });
  }
  return out;
}

async function assertCase(name, query, streetQuery, expectNeighborhoodHint) {
  const hits = await search(query);
  const precise = filterHits(hits, streetQuery);
  console.log(`\n[${name}] q="${query}"`);
  console.log(`  raw=${hits.length} precise=${precise.length}`);
  for (const p of precise.slice(0, 5)) {
    console.log(`  - ${p.road} | ${p.neighborhood || "—"} | ${p.lat.toFixed(5)},${p.lng.toFixed(5)}`);
    if (!inside(p.lat, p.lng)) throw new Error(`${name}: fora do bbox`);
  }
  if (name.startsWith("reject-")) {
    if (precise.length !== 0) throw new Error(`${name}: deveria rejeitar`);
    console.log("  OK rejeitou");
    return;
  }
  if (precise.length === 0) throw new Error(`${name}: esperado ao menos 1 rua precisa em Lauro`);
  if (expectNeighborhoodHint) {
    const ok = precise.some((p) => normalizePt(p.neighborhood).includes(normalizePt(expectNeighborhoodHint)));
    if (!ok) {
      console.log(`  WARN: nenhum candidato com bairro "${expectNeighborhoodHint}" (OSM pode omitir suburb)`);
    }
  }
  console.log("  OK dentro de Lauro de Freitas");
}

async function main() {
  await assertCase("itinga", "Rua Zulmira Fraga, Itinga, Lauro de Freitas, Bahia, Brasil", "Rua Zulmira Fraga", "Itinga");
  await new Promise((r) => setTimeout(r, 1100));
  await assertCase("jambeiro", "Rua Pomar do Jambeiro, Lauro de Freitas, Bahia, Brasil", "Rua Pomar do Jambeiro", "");
  await new Promise((r) => setTimeout(r, 1100));
  await assertCase("centro", "Rua São Mateus, Centro, Lauro de Freitas, Bahia, Brasil", "Rua São Mateus", "Centro");
  await new Promise((r) => setTimeout(r, 1100));
  await assertCase("vida-nova", "Rua Atalia, Vida Nova, Lauro de Freitas, Bahia, Brasil", "Rua Atalia", "Vida Nova");
  await new Promise((r) => setTimeout(r, 1100));
  await assertCase("multi-santos-dumont", "Avenida Santos Dumont, Lauro de Freitas, Bahia, Brasil", "Avenida Santos Dumont", "");
  await new Promise((r) => setTimeout(r, 1100));
  await assertCase("reject-suburb-itinga", "Itinga, Lauro de Freitas, Bahia, Brasil", "Itinga", "");
  await new Promise((r) => setTimeout(r, 1100));
  await assertCase(
    "reject-unknown-street",
    "Rua São Mateus de Cima, Itinga, Lauro de Freitas, Bahia, Brasil",
    "Rua São Mateus de Cima",
    "",
  );
  console.log("\nlauro-geocode-selftest: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
