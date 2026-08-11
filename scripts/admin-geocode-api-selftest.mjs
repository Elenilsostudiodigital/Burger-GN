/**
 * Selftest: Nominatim query shape used by admin Localizar Endereço (server-side).
 * Usage: node scripts/admin-geocode-api-selftest.mjs
 */
const VIEWBOX = "-38.4000,-12.7800,-38.2500,-12.9500";

async function nominatim(q) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "10");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("viewbox", VIEWBOX);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("q", q);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "pt-BR",
      "User-Agent": "TheBurgerGN/1.0 (selftest)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

const q = "Rua São Mateus, Itinga, Lauro de Freitas, Bahia, Brasil";
console.log("query:", q);
let hits = await nominatim(q);
console.log("hits:", hits.length);
if (hits.length === 0) {
  const q2 = "Rua São Mateus, Lauro de Freitas, Bahia, Brasil";
  await new Promise((r) => setTimeout(r, 1100));
  hits = await nominatim(q2);
  console.log("fallback hits:", hits.length, hits[0]?.display_name || "");
}
if (hits.length === 0) {
  console.error("FAIL: no nominatim results");
  process.exit(1);
}
console.log("ok:", hits[0]?.display_name);
console.log("PASS");
