/**
 * Server-side street geocoding for admin "Localizar Endereço".
 * Calls Nominatim from the API (avoids browser CORS / blocked fetch).
 * Restricted to Lauro de Freitas / BA.
 */

export const LAURO_DE_FREITAS_VIEWBOX = "-38.4000,-12.7800,-38.2500,-12.9500";
const LAURO_BBOX = {
  minLng: -38.4,
  maxLat: -12.78,
  maxLng: -38.25,
  minLat: -12.95,
};

export type GeocodeStreetCandidate = {
  id: string;
  lat: number;
  lng: number;
  streetName: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  displayName: string;
  query: string;
  houseNumber?: string;
  cep?: string;
};

export type GeocodeStreetSearchResult = {
  candidates: GeocodeStreetCandidate[];
  autoSelect: boolean;
  message: string | null;
};

type NominatimAddress = {
  road?: string;
  pedestrian?: string;
  residential?: string;
  street?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  quarter?: string;
  city?: string;
  town?: string;
  municipality?: string;
  village?: string;
  state?: string;
  country?: string;
  country_code?: string;
  postcode?: string;
};

type NominatimHit = {
  lat: string;
  lon: string;
  display_name?: string;
  class?: string;
  type?: string;
  place_id?: number | string;
  address?: NominatimAddress;
};

function normalizePt(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isInsideLauroBbox(lat: number, lng: number): boolean {
  return (
    lat >= LAURO_BBOX.minLat &&
    lat <= LAURO_BBOX.maxLat &&
    lng >= LAURO_BBOX.minLng &&
    lng <= LAURO_BBOX.maxLng
  );
}

function isLauroDeFreitasAddress(addr: NominatimAddress | undefined, displayName: string): boolean {
  if (!addr && !displayName) return false;
  const cityRaw = addr?.city || addr?.town || addr?.municipality || addr?.village || "";
  const stateRaw = addr?.state || "";
  const countryRaw = addr?.country || "";
  const countryCode = String(addr?.country_code || "").toLowerCase();
  const display = normalizePt(displayName);

  const cityOk =
    normalizePt(cityRaw).includes("lauro de freitas") || display.includes("lauro de freitas");
  const stateOk = !stateRaw
    ? display.includes("bahia")
    : normalizePt(stateRaw) === "bahia" || normalizePt(stateRaw) === "ba";
  const countryOk =
    countryCode === "br" ||
    normalizePt(countryRaw).includes("brasil") ||
    normalizePt(countryRaw).includes("brazil") ||
    display.includes("brasil");

  return cityOk && stateOk && countryOk;
}

function extractRoad(addr: NominatimAddress | undefined): string {
  if (!addr) return "";
  return String(addr.road || addr.pedestrian || addr.residential || addr.street || "").trim();
}

function extractNeighborhood(addr: NominatimAddress | undefined): string {
  if (!addr) return "";
  return String(addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter || "").trim();
}

function isPreciseStreetHit(hit: NominatimHit): boolean {
  const road = extractRoad(hit.address);
  if (!road) return false;
  if (
    hit.class === "place" &&
    (hit.type === "suburb" ||
      hit.type === "neighbourhood" ||
      hit.type === "city" ||
      hit.type === "municipality")
  ) {
    return false;
  }
  if (hit.class === "boundary") return false;
  if (hit.class === "highway") return true;
  if (hit.class === "place" && hit.type === "house") return true;
  return Boolean(road);
}

function roadMatchesSuggestion(road: string, streetQuery: string): boolean {
  const qRaw = normalizePt(streetQuery).replace(
    /^(rua|r|avenida|av|travessa|tv|alameda|al|estrada|rodovia|rod)\.?\s+/g,
    "",
  );
  if (!qRaw) return true;
  const rCore = normalizePt(road).replace(
    /^(rua|r|avenida|av|travessa|tv|alameda|al|estrada|rodovia|rod)\.?\s+/g,
    "",
  );
  if (!rCore) return false;
  if (rCore.includes(qRaw) || qRaw.includes(rCore)) return true;
  const tokens = qRaw.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return rCore.includes(qRaw);
  const matched = tokens.filter((t) => rCore.includes(t)).length;
  return matched >= Math.max(1, Math.ceil(tokens.length * 0.5));
}

function hitToCandidate(
  hit: NominatimHit,
  query: string,
  streetQuery: string,
): GeocodeStreetCandidate | null {
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isInsideLauroBbox(lat, lng)) return null;
  const displayName = String(hit.display_name || "");
  if (!isLauroDeFreitasAddress(hit.address, displayName)) return null;
  if (!isPreciseStreetHit(hit)) return null;

  const streetName = extractRoad(hit.address);
  if (streetQuery.trim() && !roadMatchesSuggestion(streetName, streetQuery)) return null;

  const neighborhood = extractNeighborhood(hit.address);
  const city =
    hit.address?.city || hit.address?.town || hit.address?.municipality || "Lauro de Freitas";
  const state = hit.address?.state || "Bahia";
  const country = hit.address?.country || "Brasil";
  const houseNumber = String(hit.address?.house_number || "").trim();
  const cep = String(hit.address?.postcode || "")
    .replace(/\D/g, "")
    .slice(0, 8);
  const id = String(hit.place_id ?? `${lat.toFixed(5)},${lng.toFixed(5)},${streetName}`);

  return {
    id,
    // Explicit Number() so JSON never serializes accidental string coords
    lat: Number(lat),
    lng: Number(lng),
    streetName: String(streetName || ""),
    neighborhood: String(neighborhood || ""),
    city: String(city || ""),
    state: String(state || ""),
    country: String(country || ""),
    displayName: String(displayName || ""),
    query: String(query || ""),
    houseNumber: houseNumber || undefined,
    cep: cep || undefined,
  };
}

function dedupeCandidates(list: GeocodeStreetCandidate[]): GeocodeStreetCandidate[] {
  const seen = new Set<string>();
  const out: GeocodeStreetCandidate[] = [];
  for (const c of list) {
    const key = `${normalizePt(c.streetName)}|${normalizePt(c.neighborhood)}|${c.lat.toFixed(4)}|${c.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

async function nominatimSearchLauro(
  params: Record<string, string>,
  limit = 15,
): Promise<NominatimHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("viewbox", LAURO_DE_FREITAS_VIEWBOX);
  url.searchParams.set("bounded", "1");
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": "pt-BR",
      "User-Agent": "TheBurgerGN/1.0 (admin-geocode; contact@burgergn.local)",
    },
  });
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }
  const data = (await res.json()) as NominatimHit[];
  return Array.isArray(data) ? data : [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Geocode for admin street registration.
 * Query priority: Rua + Bairro + Cidade. No auto-select.
 */
export async function geocodeStreetLocation(parts: {
  street: string;
  neighborhood?: string;
  city?: string;
  cep?: string;
  state?: string;
  number?: string;
}): Promise<GeocodeStreetSearchResult> {
  const street = String(parts.street || "").trim();
  const neighborhood = String(parts.neighborhood || "").trim();
  const city = String(parts.city || "Lauro de Freitas").trim() || "Lauro de Freitas";
  const state = String(parts.state || "Bahia").trim() || "Bahia";
  const number = String(parts.number || "").trim();
  const notFoundMsg = "Nenhum endereço encontrado nesta região.";

  if (street.length < 3) {
    return { candidates: [], autoSelect: false, message: "Informe o nome da rua (mín. 3 caracteres)." };
  }
  if (!neighborhood) {
    return { candidates: [], autoSelect: false, message: "Informe o bairro para localizar o endereço." };
  }

  const collected: GeocodeStreetCandidate[] = [];
  const queries: string[] = [];
  if (number) {
    queries.push(`${street}, ${number}, ${neighborhood}, ${city}, ${state}, Brasil`);
  }
  queries.push(`${street}, ${neighborhood}, ${city}, ${state}, Brasil`);
  queries.push(`${street}, ${city}, ${state}, Brasil`);
  const streetCore = street.replace(/^(rua|r\.?|avenida|av\.?|travessa|tv\.?)\s+/i, "").trim();
  if (streetCore.length >= 3 && normalizePt(streetCore) !== normalizePt(street)) {
    queries.push(`${streetCore}, ${neighborhood}, ${city}, ${state}, Brasil`);
  }

  const seenQuery = new Set<string>();
  let nominatimErrors = 0;
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]!.replace(/\s+/g, " ").trim();
    const key = normalizePt(q);
    if (!q || seenQuery.has(key)) continue;
    seenQuery.add(key);
    if (i > 0) await sleep(1100);
    try {
      const hits = await nominatimSearchLauro({ q }, 15);
      for (const hit of hits) {
        const c = hitToCandidate(hit, q, street);
        if (c) {
          collected.push({
            ...c,
            houseNumber: c.houseNumber || number || undefined,
          });
        }
      }
    } catch {
      nominatimErrors += 1;
    }
    if (dedupeCandidates(collected).length >= 8) break;
    // If first (Rua+Bairro+Cidade) already returned matches, stop early
    if (i === 0 && dedupeCandidates(collected).length > 0) break;
  }

  if (dedupeCandidates(collected).length < 3) {
    await sleep(1100);
    try {
      const hits = await nominatimSearchLauro(
        { street: number ? `${street} ${number}` : street, city, state, country: "Brasil" },
        15,
      );
      for (const hit of hits) {
        const c = hitToCandidate(hit, street, street);
        if (c) collected.push(c);
      }
    } catch {
      nominatimErrors += 1;
    }
  }

  let candidates = dedupeCandidates(collected);

  if (neighborhood && candidates.length > 1) {
    const nKey = normalizePt(neighborhood);
    candidates = [...candidates].sort((a, b) => {
      const aMatch =
        normalizePt(a.neighborhood).includes(nKey) || nKey.includes(normalizePt(a.neighborhood))
          ? 0
          : 1;
      const bMatch =
        normalizePt(b.neighborhood).includes(nKey) || nKey.includes(normalizePt(b.neighborhood))
          ? 0
          : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return normalizePt(a.streetName).localeCompare(normalizePt(b.streetName));
    });
  }

  candidates = candidates.slice(0, 12);

  if (candidates.length === 0) {
    if (nominatimErrors > 0 && seenQuery.size === nominatimErrors) {
      return {
        candidates: [],
        autoSelect: false,
        message: "Não foi possível consultar o mapa agora. Tente novamente em instantes.",
      };
    }
    return { candidates: [], autoSelect: false, message: notFoundMsg };
  }

  return { candidates, autoSelect: false, message: null };
}
