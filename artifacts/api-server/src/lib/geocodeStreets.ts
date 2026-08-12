/**
 * Server-side street geocoding for admin "Localizar Endereço".
 * Primary: Nominatim (OSM). Fallback: ViaCEP street search + BrasilAPI CEP coords.
 * Restricted to Lauro de Freitas / BA.
 *
 * Why ViaCEP fallback: Nominatim coverage of residential streets in Lauro is
 * incomplete — valid CEP/logradouro addresses often return zero OSM hits and
 * the UI showed "Nenhum endereço encontrado nesta região."
 */

export const LAURO_DE_FREITAS_VIEWBOX = "-38.4000,-12.7800,-38.2500,-12.9500";
const LAURO_BBOX = {
  minLng: -38.4,
  maxLat: -12.78,
  maxLng: -38.25,
  minLat: -12.95,
};

/** Approximate city center when a CEP has no precise coordinates. */
const LAURO_CENTER = { lat: -12.89444, lng: -38.32722 };

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
  county?: string;
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

type ViaCepEntry = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

function normalizePt(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripStreetType(street: string): string {
  return String(street || "")
    .replace(
      /^(rua|r\.?|avenida|av\.?|travessa|tv\.?|alameda|al\.?|estrada|rodovia|rod\.?)\s+/i,
      "",
    )
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
  const cityRaw =
    addr?.city ||
    addr?.town ||
    addr?.municipality ||
    addr?.village ||
    addr?.county ||
    "";
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
  const qRaw = normalizePt(stripStreetType(streetQuery));
  if (!qRaw) return true;
  const rCore = normalizePt(stripStreetType(road));
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

function sortByNeighborhood(
  candidates: GeocodeStreetCandidate[],
  neighborhood: string,
): GeocodeStreetCandidate[] {
  if (!neighborhood || candidates.length <= 1) return candidates;
  const nKey = normalizePt(neighborhood);
  return [...candidates].sort((a, b) => {
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

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function nominatimSearchLauro(
  params: Record<string, string>,
  limit = 15,
  bounded = false,
): Promise<NominatimHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("viewbox", LAURO_DE_FREITAS_VIEWBOX);
  // Prefer the Lauro viewbox, but do not hard-bound: OSM often misses streets when
  // bounded=1 and the typed neighborhood is not in the index.
  if (bounded) url.searchParams.set("bounded", "1");
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return fetchJson<NominatimHit[]>(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": "pt-BR",
      "User-Agent": "TheBurgerGN/1.0 (admin-geocode; contact@burgergn.local)",
    },
  }).then((data) => (Array.isArray(data) ? data : []));
}

/** ViaCEP logradouro search terms derived from the typed street. */
function viaCepSearchTerms(street: string): string[] {
  const raw = street.trim();
  const core = stripStreetType(raw);
  const terms: string[] = [];
  const push = (t: string) => {
    const v = t.replace(/\s+/g, " ").trim();
    if (v.length >= 3) terms.push(v);
  };
  push(raw);
  push(core);
  const parts = core.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const noArticles = parts.filter((p) => !/^(d[aoe]s?|e)$/i.test(p)).join(" ");
    push(noArticles);
    // Only use a single last token when distinctive (avoids "Campo" → 10 unrelated hits).
    const last = parts[parts.length - 1]!;
    if (last.length >= 5) push(last);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const k = normalizePt(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.slice(0, 4);
}

/** Stricter match for ViaCEP rows (postal data is noisy on short tokens). */
function viaCepRoadMatch(road: string, streetQuery: string): boolean {
  const qRaw = normalizePt(stripStreetType(streetQuery));
  const rCore = normalizePt(stripStreetType(road));
  if (!qRaw || !rCore) return false;
  if (rCore === qRaw) return true;
  if (rCore.includes(qRaw)) return true;
  if (qRaw.includes(rCore) && rCore.length >= 5) return true;

  const qTokens = qRaw
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/^(d[aoe]s?|e)$/i.test(t));
  const rTokens = rCore.split(/\s+/).filter(Boolean);
  if (qTokens.length === 0) return false;
  if (!qTokens.every((t) => rCore.includes(t))) return false;
  // Single-token queries must match a one-word road core (avoids "Campo" → "Campo Alegre…").
  if (qTokens.length === 1) {
    return rTokens.length === 1 && rTokens[0] === qTokens[0];
  }
  return true;
}

async function viaCepLookupStreet(city: string, term: string): Promise<ViaCepEntry[]> {
  const url =
    `https://viacep.com.br/ws/BA/${encodeURIComponent(city)}/${encodeURIComponent(term)}/json/`;
  const data = await fetchJson<ViaCepEntry[] | ViaCepEntry>(url, {
    headers: { Accept: "application/json" },
  }, 8000);
  if (Array.isArray(data)) return data.filter((e) => e && !e.erro && e.logradouro);
  if (data && typeof data === "object" && !data.erro && data.logradouro) return [data];
  return [];
}

async function brasilApiCepCoords(cep: string): Promise<{ lat: number; lng: number } | null> {
  const digits = cep.replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return null;
  try {
    const data = await fetchJson<{
      location?: { coordinates?: { latitude?: string; longitude?: string } };
    }>(`https://brasilapi.com.br/api/cep/v2/${digits}`, { headers: { Accept: "application/json" } }, 8000);
    const lat = parseFloat(String(data?.location?.coordinates?.latitude ?? ""));
    const lng = parseFloat(String(data?.location?.coordinates?.longitude ?? ""));
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  } catch {
    /* ignore */
  }
  return null;
}

async function viaCepFallback(parts: {
  street: string;
  neighborhood: string;
  city: string;
  number?: string;
}): Promise<GeocodeStreetCandidate[]> {
  const city = parts.city || "Lauro de Freitas";
  const pending: Array<{
    streetName: string;
    neighborhood: string;
    city: string;
    cep: string;
    query: string;
  }> = [];
  const seenKey = new Set<string>();

  for (const term of viaCepSearchTerms(parts.street)) {
    let entries: ViaCepEntry[] = [];
    try {
      entries = await viaCepLookupStreet(city, term);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const streetName = String(entry.logradouro || "").trim();
      if (!streetName) continue;
      if (!viaCepRoadMatch(streetName, parts.street)) continue;
      const cep = String(entry.cep || "").replace(/\D/g, "").slice(0, 8);
      const key = cep || `${normalizePt(streetName)}|${normalizePt(entry.bairro || "")}`;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      pending.push({
        streetName,
        neighborhood: String(entry.bairro || "").trim(),
        city: String(entry.localidade || city),
        cep,
        query: term,
      });
    }
    if (pending.length >= 12) break;
  }

  const ranked = sortByNeighborhood(
    pending.map((p) => ({
      id: p.cep || p.streetName,
      lat: LAURO_CENTER.lat,
      lng: LAURO_CENTER.lng,
      streetName: p.streetName,
      neighborhood: p.neighborhood,
      city: p.city,
      state: "Bahia",
      country: "Brasil",
      displayName: "",
      query: p.query,
      cep: p.cep || undefined,
    })),
    parts.neighborhood,
  ).slice(0, 8);

  const collected: GeocodeStreetCandidate[] = [];
  for (const row of ranked) {
    const meta = pending.find(
      (p) => p.streetName === row.streetName && p.neighborhood === row.neighborhood,
    );
    const cep = meta?.cep || "";
    const coords = (cep ? await brasilApiCepCoords(cep) : null) || LAURO_CENTER;
    collected.push({
      id: `viacep:${cep || `${normalizePt(row.streetName)}|${normalizePt(row.neighborhood)}`}`,
      lat: Number(coords.lat),
      lng: Number(coords.lng),
      streetName: row.streetName,
      neighborhood: row.neighborhood,
      city: row.city,
      state: "Bahia",
      country: "Brasil",
      displayName: [row.streetName, row.neighborhood, row.city, "Bahia", cep, "Brasil"]
        .filter(Boolean)
        .join(", "),
      query: meta?.query || parts.street,
      houseNumber: parts.number || undefined,
      cep: cep || undefined,
    });
  }

  return dedupeCandidates(collected);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Geocode for admin street registration.
 * Query priority: Rua + Bairro + Cidade. No auto-select.
 * Falls back to ViaCEP when Nominatim has no street coverage.
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
  const cepDigits = String(parts.cep || "").replace(/\D/g, "").slice(0, 8);
  const notFoundMsg = "Nenhum endereço encontrado nesta região.";

  if (street.length < 3) {
    return { candidates: [], autoSelect: false, message: "Informe o nome da rua (mín. 3 caracteres)." };
  }
  if (!neighborhood) {
    return { candidates: [], autoSelect: false, message: "Informe o bairro para localizar o endereço." };
  }

  const collected: GeocodeStreetCandidate[] = [];

  // Fast path: CEP informed → BrasilAPI / ViaCEP for that CEP.
  if (cepDigits.length === 8) {
    try {
      const via = await fetchJson<ViaCepEntry>(
        `https://viacep.com.br/ws/${cepDigits}/json/`,
        { headers: { Accept: "application/json" } },
        8000,
      );
      if (via && !via.erro && via.logradouro) {
        const coords = (await brasilApiCepCoords(cepDigits)) || LAURO_CENTER;
        if (normalizePt(via.localidade || "").includes("lauro de freitas")) {
          collected.push({
            id: `viacep-cep:${cepDigits}`,
            lat: Number(coords.lat),
            lng: Number(coords.lng),
            streetName: String(via.logradouro),
            neighborhood: String(via.bairro || neighborhood),
            city: String(via.localidade || city),
            state: "Bahia",
            country: "Brasil",
            displayName: [via.logradouro, via.bairro, via.localidade, "Bahia", via.cep, "Brasil"]
              .filter(Boolean)
              .join(", "),
            query: cepDigits,
            houseNumber: number || undefined,
            cep: cepDigits,
          });
        }
      }
    } catch {
      /* continue with street search */
    }
  }

  const queries: string[] = [];
  if (number) {
    queries.push(`${street}, ${number}, ${neighborhood}, ${city}, ${state}, Brasil`);
  }
  queries.push(`${street}, ${neighborhood}, ${city}, ${state}, Brasil`);
  queries.push(`${street}, ${city}, ${state}, Brasil`);
  const streetCore = stripStreetType(street);
  if (streetCore.length >= 3 && normalizePt(streetCore) !== normalizePt(street)) {
    queries.push(`${streetCore}, ${neighborhood}, ${city}, ${state}, Brasil`);
  }

  const seenQuery = new Set<string>();
  let nominatimErrors = 0;
  let nominatimAttempts = 0;
  // Keep Nominatim attempts short: OSM coverage is sparse here, and long
  // sequential sleeps left the UI stuck on "Localizando..." before ViaCEP.
  const maxNominatimQueries = 2;
  for (let i = 0; i < queries.length && nominatimAttempts < maxNominatimQueries; i++) {
    const q = queries[i]!.replace(/\s+/g, " ").trim();
    const key = normalizePt(q);
    if (!q || seenQuery.has(key)) continue;
    seenQuery.add(key);
    if (nominatimAttempts > 0) await sleep(1100);
    nominatimAttempts += 1;
    try {
      const hits = await nominatimSearchLauro({ q }, 15, false);
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
    if (dedupeCandidates(collected).length > 0) break;
  }

  let candidates = dedupeCandidates(collected);

  // ViaCEP covers many residential streets missing from OSM/Nominatim.
  if (candidates.length === 0) {
    try {
      const viaCandidates = await viaCepFallback({ street, neighborhood, city, number });
      candidates = viaCandidates;
    } catch {
      /* keep empty */
    }
  }

  candidates = sortByNeighborhood(candidates, neighborhood).slice(0, 12);

  if (candidates.length === 0) {
    if (nominatimAttempts > 0 && nominatimErrors >= nominatimAttempts) {
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
