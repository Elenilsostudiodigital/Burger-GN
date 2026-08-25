/**
 * Server-side street geocoding for admin "Localizar Endereço".
 *
 * Contract:
 * - Exact street-name match is required for the primary result set
 * - Neighborhood and city are mandatory filters when provided
 * - Never return a street from another neighborhood/city when filters are set
 * - Without an exact match → message "Endereço não encontrado"
 * - Similar-name suggestions only when `similar: true` is requested
 */

export const LAURO_DE_FREITAS_VIEWBOX = "-38.4000,-12.7800,-38.2500,-12.9500";
const LAURO_BBOX = {
  minLng: -38.4,
  maxLat: -12.78,
  maxLng: -38.25,
  minLat: -12.95,
};

const LAURO_CENTER = { lat: -12.89444, lng: -38.32722 };
export const ADDRESS_NOT_FOUND_MSG = "Endereço não encontrado";

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
  /** Similar-name suggestions; only populated when `similar: true`. */
  suggestions: GeocodeStreetCandidate[];
  autoSelect: boolean;
  message: string | null;
  /** True when exact search found nothing (UI may offer "ver semelhantes"). */
  exactNotFound: boolean;
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

/** Exact street match ignoring type prefix / accents / case / extra spaces. */
function isExactStreetName(road: string, streetQuery: string): boolean {
  const q = normalizePt(stripStreetType(streetQuery));
  const r = normalizePt(stripStreetType(road));
  if (!q || !r) return false;
  if (q === r) return true;
  // Also accept full string equality including type when both sides keep it.
  return normalizePt(streetQuery) === normalizePt(road);
}

function isSimilarStreetName(road: string, streetQuery: string): boolean {
  if (isExactStreetName(road, streetQuery)) return false;
  const q = normalizePt(stripStreetType(streetQuery));
  const r = normalizePt(stripStreetType(road));
  if (!q || !r) return false;
  if (r.includes(q) || q.includes(r)) return true;
  const qTokens = q
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/^(d[aoe]s?|e)$/i.test(t));
  if (qTokens.length === 0) return false;
  const matched = qTokens.filter((t) => r.includes(t)).length;
  return matched >= Math.max(1, Math.ceil(qTokens.length * 0.6));
}

function cityMatches(candidateCity: string, filterCity: string): boolean {
  if (!filterCity.trim()) return true;
  const c = normalizePt(candidateCity);
  const f = normalizePt(filterCity);
  return c === f || c.includes(f) || f.includes(c);
}

function neighborhoodMatches(candidateNeighborhood: string, filterNeighborhood: string): boolean {
  if (!filterNeighborhood.trim()) return true;
  const c = normalizePt(candidateNeighborhood);
  const f = normalizePt(filterNeighborhood);
  if (!c) return false;
  return c === f || c.includes(f) || f.includes(c);
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

function hitToCandidate(
  hit: NominatimHit,
  query: string,
): GeocodeStreetCandidate | null {
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isInsideLauroBbox(lat, lng)) return null;
  const displayName = String(hit.display_name || "");
  if (!isLauroDeFreitasAddress(hit.address, displayName)) return null;
  if (!isPreciseStreetHit(hit)) return null;

  const streetName = extractRoad(hit.address);
  if (!streetName) return null;

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

function applyMandatoryFilters(
  list: GeocodeStreetCandidate[],
  neighborhood: string,
  city: string,
): GeocodeStreetCandidate[] {
  return list.filter(
    (c) => cityMatches(c.city, city) && neighborhoodMatches(c.neighborhood, neighborhood),
  );
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
): Promise<NominatimHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("viewbox", LAURO_DE_FREITAS_VIEWBOX);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const data = await fetchJson<NominatimHit[]>(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": "pt-BR",
      "User-Agent": "TheBurgerGN/1.0 (admin-geocode; contact@burgergn.local)",
    },
  });
  return Array.isArray(data) ? data : [];
}

function viaCepSearchTermsExact(street: string): string[] {
  const raw = street.trim();
  const core = stripStreetType(raw);
  const terms: string[] = [];
  const push = (t: string) => {
    const v = t.replace(/\s+/g, " ").trim();
    if (v.length >= 3) terms.push(v);
  };
  // Exact-oriented terms only — no last-token fragments.
  push(raw);
  push(core);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const k = normalizePt(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function viaCepSearchTermsSimilar(street: string): string[] {
  const core = stripStreetType(street);
  const terms = [...viaCepSearchTermsExact(street)];
  const parts = core.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const noArticles = parts.filter((p) => !/^(d[aoe]s?|e)$/i.test(p)).join(" ");
    if (noArticles.length >= 3) terms.push(noArticles);
    const last = parts[parts.length - 1]!;
    if (last.length >= 5) terms.push(last);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const k = normalizePt(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.slice(0, 5);
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

async function collectViaCepCandidates(parts: {
  street: string;
  neighborhood: string;
  city: string;
  number?: string;
  mode: "exact" | "similar";
}): Promise<GeocodeStreetCandidate[]> {
  const city = parts.city || "Lauro de Freitas";
  const terms =
    parts.mode === "exact"
      ? viaCepSearchTermsExact(parts.street)
      : viaCepSearchTermsSimilar(parts.street);
  const pending: Array<{
    streetName: string;
    neighborhood: string;
    city: string;
    cep: string;
    query: string;
  }> = [];
  const seenKey = new Set<string>();

  for (const term of terms) {
    let entries: ViaCepEntry[] = [];
    try {
      entries = await viaCepLookupStreet(city, term);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const streetName = String(entry.logradouro || "").trim();
      if (!streetName) continue;
      const match =
        parts.mode === "exact"
          ? isExactStreetName(streetName, parts.street)
          : isSimilarStreetName(streetName, parts.street);
      if (!match) continue;
      const neighborhood = String(entry.bairro || "").trim();
      const entryCity = String(entry.localidade || city).trim();
      if (!cityMatches(entryCity, city)) continue;
      if (!neighborhoodMatches(neighborhood, parts.neighborhood)) continue;

      const cep = String(entry.cep || "").replace(/\D/g, "").slice(0, 8);
      const key = cep || `${normalizePt(streetName)}|${normalizePt(neighborhood)}`;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      pending.push({
        streetName,
        neighborhood,
        city: entryCity,
        cep,
        query: term,
      });
    }
    if (pending.length >= 12) break;
  }

  const collected: GeocodeStreetCandidate[] = [];
  for (const row of pending.slice(0, 8)) {
    const coords = (row.cep ? await brasilApiCepCoords(row.cep) : null) || LAURO_CENTER;
    collected.push({
      id: `viacep:${row.cep || `${normalizePt(row.streetName)}|${normalizePt(row.neighborhood)}`}`,
      lat: Number(coords.lat),
      lng: Number(coords.lng),
      streetName: row.streetName,
      neighborhood: row.neighborhood,
      city: row.city,
      state: "Bahia",
      country: "Brasil",
      displayName: [row.streetName, row.neighborhood, row.city, "Bahia", row.cep, "Brasil"]
        .filter(Boolean)
        .join(", "),
      query: row.query,
      houseNumber: parts.number || undefined,
      cep: row.cep || undefined,
    });
  }
  return dedupeCandidates(collected);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function collectNominatimCandidates(parts: {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  number?: string;
  mode: "exact" | "similar";
}): Promise<{ candidates: GeocodeStreetCandidate[]; errors: number; attempts: number }> {
  const collected: GeocodeStreetCandidate[] = [];
  const queries: string[] = [];
  if (parts.number) {
    queries.push(
      `${parts.street}, ${parts.number}, ${parts.neighborhood}, ${parts.city}, ${parts.state}, Brasil`,
    );
  }
  queries.push(`${parts.street}, ${parts.neighborhood}, ${parts.city}, ${parts.state}, Brasil`);
  queries.push(`${parts.street}, ${parts.city}, ${parts.state}, Brasil`);

  const seenQuery = new Set<string>();
  let errors = 0;
  let attempts = 0;
  const maxQueries = parts.mode === "exact" ? 2 : 2;

  for (let i = 0; i < queries.length && attempts < maxQueries; i++) {
    const q = queries[i]!.replace(/\s+/g, " ").trim();
    const key = normalizePt(q);
    if (!q || seenQuery.has(key)) continue;
    seenQuery.add(key);
    if (attempts > 0) await sleep(1100);
    attempts += 1;
    try {
      const hits = await nominatimSearchLauro({ q }, 15);
      for (const hit of hits) {
        const c = hitToCandidate(hit, q);
        if (!c) continue;
        const nameOk =
          parts.mode === "exact"
            ? isExactStreetName(c.streetName, parts.street)
            : isSimilarStreetName(c.streetName, parts.street) ||
              isExactStreetName(c.streetName, parts.street);
        if (!nameOk) continue;
        if (!cityMatches(c.city, parts.city)) continue;
        if (!neighborhoodMatches(c.neighborhood, parts.neighborhood)) continue;
        collected.push({
          ...c,
          houseNumber: c.houseNumber || parts.number || undefined,
        });
      }
    } catch {
      errors += 1;
    }
    if (dedupeCandidates(collected).length > 0 && parts.mode === "exact") break;
  }

  return { candidates: dedupeCandidates(collected), errors, attempts };
}

/**
 * Geocode for admin street registration.
 * Default: exact street match + mandatory neighborhood/city filters.
 * Pass `similar: true` only when the user explicitly asks for similar suggestions.
 */
export async function geocodeStreetLocation(parts: {
  street: string;
  neighborhood?: string;
  city?: string;
  cep?: string;
  state?: string;
  number?: string;
  similar?: boolean;
}): Promise<GeocodeStreetSearchResult> {
  const street = String(parts.street || "").trim();
  const neighborhood = String(parts.neighborhood || "").trim();
  const city = String(parts.city || "Lauro de Freitas").trim() || "Lauro de Freitas";
  const state = String(parts.state || "Bahia").trim() || "Bahia";
  const number = String(parts.number || "").trim();
  const cepDigits = String(parts.cep || "").replace(/\D/g, "").slice(0, 8);
  const wantSimilar = parts.similar === true;

  const empty = (message: string, exactNotFound = false): GeocodeStreetSearchResult => ({
    candidates: [],
    suggestions: [],
    autoSelect: false,
    message,
    exactNotFound,
  });

  if (street.length < 3) {
    return empty("Informe o nome da rua (mín. 3 caracteres).");
  }
  if (!neighborhood) {
    return empty("Informe o bairro para localizar o endereço.");
  }
  if (!city) {
    return empty("Informe a cidade para localizar o endereço.");
  }

  // ── Exact path ────────────────────────────────────────────────────────────
  const exactCollected: GeocodeStreetCandidate[] = [];

  if (cepDigits.length === 8) {
    try {
      const via = await fetchJson<ViaCepEntry>(
        `https://viacep.com.br/ws/${cepDigits}/json/`,
        { headers: { Accept: "application/json" } },
        8000,
      );
      if (via && !via.erro && via.logradouro) {
        const entryCity = String(via.localidade || "").trim();
        const entryNeighborhood = String(via.bairro || "").trim();
        if (
          isExactStreetName(String(via.logradouro), street) &&
          cityMatches(entryCity, city) &&
          neighborhoodMatches(entryNeighborhood, neighborhood)
        ) {
          const coords = (await brasilApiCepCoords(cepDigits)) || LAURO_CENTER;
          exactCollected.push({
            id: `viacep-cep:${cepDigits}`,
            lat: Number(coords.lat),
            lng: Number(coords.lng),
            streetName: String(via.logradouro),
            neighborhood: entryNeighborhood,
            city: entryCity || city,
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
      /* continue */
    }
  }

  const nomExact = await collectNominatimCandidates({
    street,
    neighborhood,
    city,
    state,
    number,
    mode: "exact",
  });
  exactCollected.push(...nomExact.candidates);

  let exact = applyMandatoryFilters(dedupeCandidates(exactCollected), neighborhood, city);

  if (exact.length === 0) {
    try {
      const viaExact = await collectViaCepCandidates({
        street,
        neighborhood,
        city,
        number,
        mode: "exact",
      });
      exact = applyMandatoryFilters(viaExact, neighborhood, city);
    } catch {
      /* keep empty */
    }
  }

  exact = exact.slice(0, 12);

  if (exact.length > 0 && !wantSimilar) {
    return {
      candidates: exact,
      suggestions: [],
      autoSelect: false,
      message: null,
      exactNotFound: false,
    };
  }

  // ── Similar suggestions (only when requested) ─────────────────────────────
  let suggestions: GeocodeStreetCandidate[] = [];
  if (wantSimilar) {
    const nomSimilar = await collectNominatimCandidates({
      street,
      neighborhood,
      city,
      state,
      number,
      mode: "similar",
    });
    suggestions.push(...nomSimilar.candidates);
    try {
      const viaSimilar = await collectViaCepCandidates({
        street,
        neighborhood,
        city,
        number,
        mode: "similar",
      });
      suggestions.push(...viaSimilar);
    } catch {
      /* ignore */
    }
    // Exclude exact matches from suggestions list; keep only same city/neighborhood.
    const exactKeys = new Set(
      exact.map((c) => `${normalizePt(c.streetName)}|${normalizePt(c.neighborhood)}`),
    );
    suggestions = applyMandatoryFilters(dedupeCandidates(suggestions), neighborhood, city)
      .filter((c) => !exactKeys.has(`${normalizePt(c.streetName)}|${normalizePt(c.neighborhood)}`))
      .slice(0, 12);

    if (exact.length > 0) {
      return {
        candidates: exact,
        suggestions,
        autoSelect: false,
        message: null,
        exactNotFound: false,
      };
    }

    if (suggestions.length > 0) {
      return {
        candidates: [],
        suggestions,
        autoSelect: false,
        message: null,
        exactNotFound: true,
      };
    }

    return empty(ADDRESS_NOT_FOUND_MSG, true);
  }

  // Exact not found and similar not requested.
  if (nomExact.attempts > 0 && nomExact.errors >= nomExact.attempts && exact.length === 0) {
    // Network failure to map providers — still use the required exact-not-found copy
    // when we simply have no exact row; only surface provider outage if every attempt errored
    // and ViaCEP also failed to return anything (already empty).
  }

  return empty(ADDRESS_NOT_FOUND_MSG, true);
}

/**
 * Checkout geocoding for the Lauro de Freitas / Itinga (Salvador) border.
 * OSM lists several Itinga streets as Salvador, so forcing only
 * "Lauro de Freitas" in the query returns zero results.
 */
const CHECKOUT_BBOX = {
  minLng: -38.45,
  maxLng: -38.22,
  minLat: -12.96,
  maxLat: -12.77,
};

function isInsideCheckoutBbox(lat: number, lng: number): boolean {
  return (
    lat >= CHECKOUT_BBOX.minLat &&
    lat <= CHECKOUT_BBOX.maxLat &&
    lng >= CHECKOUT_BBOX.minLng &&
    lng <= CHECKOUT_BBOX.maxLng
  );
}

function isBahiaMetroHit(addr: NominatimAddress | undefined, displayName: string): boolean {
  const display = normalizePt(displayName);
  const stateRaw = addr?.state || "";
  const stateOk =
    !stateRaw
      ? display.includes("bahia")
      : normalizePt(stateRaw) === "bahia" || normalizePt(stateRaw) === "ba";
  const cityRaw = normalizePt(
    addr?.city || addr?.town || addr?.municipality || addr?.village || addr?.county || "",
  );
  const cityOk =
    cityRaw.includes("lauro de freitas") ||
    cityRaw.includes("salvador") ||
    display.includes("lauro de freitas") ||
    display.includes("salvador") ||
    display.includes("itinga");
  return stateOk && cityOk;
}

export type CheckoutGeocodeHit = {
  lat: number;
  lng: number;
  displayName: string;
  streetName: string;
  neighborhood: string;
  city: string;
};

export async function geocodeCheckoutAddress(parts: {
  street: string;
  number?: string;
  neighborhood?: string;
  city?: string;
}): Promise<CheckoutGeocodeHit | null> {
  const street = String(parts.street || "").trim();
  const number = String(parts.number || "").trim();
  const neighborhood = String(parts.neighborhood || "").trim();
  if (street.length < 3) return null;

  const queries: string[] = [];
  const push = (q: string) => {
    const v = q.replace(/\s+/g, " ").trim();
    if (v.length >= 8 && !queries.includes(v)) queries.push(v);
  };
  const cities = ["Lauro de Freitas", "Salvador"];
  for (const city of cities) {
    if (number && neighborhood) {
      push(`${street}, ${number}, ${neighborhood}, ${city}, Bahia, Brasil`);
    }
    if (neighborhood) push(`${street}, ${neighborhood}, ${city}, Bahia, Brasil`);
    push(`${street}, ${city}, Bahia, Brasil`);
  }
  if (neighborhood) push(`${street}, ${neighborhood}, Bahia, Brasil`);
  push(`${street}, Itinga, Bahia, Brasil`);

  for (let i = 0; i < Math.min(queries.length, 4); i++) {
    if (i > 0) await sleep(200);
    const q = queries[i]!;
    let hits: NominatimHit[] = [];
    try {
      hits = await nominatimSearchLauro({ q }, 8);
    } catch {
      continue;
    }
    const ranked: CheckoutGeocodeHit[] = [];
    for (const hit of hits) {
      const lat = parseFloat(hit.lat);
      const lng = parseFloat(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (!isInsideCheckoutBbox(lat, lng)) continue;
      const displayName = String(hit.display_name || "");
      if (!isBahiaMetroHit(hit.address, displayName)) continue;
      const road = extractRoad(hit.address);
      if (road && !isExactStreetName(road, street) && !isSimilarStreetName(road, street)) continue;
      if (!road && hit.class !== "highway" && hit.class !== "building" && hit.class !== "place") {
        continue;
      }
      ranked.push({
        lat,
        lng,
        displayName,
        streetName: road || street,
        neighborhood: extractNeighborhood(hit.address) || neighborhood,
        city: String(hit.address?.city || hit.address?.town || hit.address?.municipality || ""),
      });
    }
    const exact = ranked.filter((c) => isExactStreetName(c.streetName, street));
    const pick = exact[0] || ranked[0];
    if (pick) return pick;
  }
  return null;
}
