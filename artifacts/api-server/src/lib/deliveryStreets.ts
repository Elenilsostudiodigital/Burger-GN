/**
 * Helpers for delivery street registry — normalize names, suggest fees, ETA.
 * Reuses the same Haversine + KM-tier math as checkout (no new map vendor).
 */

export function normalizeStreetKey(street: string): string {
  return String(street || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(rua|r\.?|avenida|av\.?|travessa|tv\.?|alameda|al\.?|estrada|rodovia|rod\.?)\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function displayStreetName(street: string): string {
  return String(street || "").trim().replace(/\s+/g, " ");
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findKmTier(
  distanceKm: number,
  tiers: Array<{ fromKm: string; toKm: string | null; fee: string | null }> | null | undefined,
): { fee: number | null; consult: boolean } {
  if (!Array.isArray(tiers) || tiers.length === 0 || !Number.isFinite(distanceKm)) {
    return { fee: null, consult: true };
  }
  const sorted = [...tiers].sort(
    (a, b) => parseFloat(String(a.fromKm)) - parseFloat(String(b.fromKm)),
  );
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i]!;
    const from = parseFloat(String(tier.fromKm));
    const explicitTo =
      tier.toKm !== null && tier.toKm !== undefined ? parseFloat(String(tier.toKm)) : Infinity;
    const nextFrom =
      i + 1 < sorted.length ? parseFloat(String(sorted[i + 1]!.fromKm)) : NaN;
    // Close gaps like 0–2 then 2.1–4 so 2.05 km still belongs to a band.
    const to =
      Number.isFinite(nextFrom) && nextFrom > from
        ? Math.max(Number.isFinite(explicitTo) ? explicitTo : 0, nextFrom)
        : explicitTo;
    if (!Number.isFinite(from)) continue;
    const inBand =
      Number.isFinite(nextFrom) && nextFrom > from
        ? distanceKm >= from && distanceKm < nextFrom
        : distanceKm >= from && distanceKm <= to;
    if (inBand) {
      return {
        fee:
          tier.fee !== null && tier.fee !== undefined ? parseFloat(String(tier.fee)) : null,
        consult: tier.fee === null,
      };
    }
  }
  return { fee: null, consult: true };
}

/** Rough urban driving ETA from distance (minutes). */
export function estimateEtaMinutes(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 10;
  return Math.max(8, Math.round((distanceKm / 22) * 60) + 5);
}

export function suggestFeeFromDistance(
  distanceKm: number,
  tiers: Array<{ fromKm: string; toKm: string | null; fee: string | null }>,
): number | null {
  if (!Number.isFinite(distanceKm)) return null;
  const { fee, consult } = findKmTier(distanceKm, tiers);
  if (!consult && fee != null && Number.isFinite(fee)) return fee;
  if (distanceKm <= 2) return 5;
  if (distanceKm <= 4) return 7;
  if (distanceKm <= 6) return 9;
  if (distanceKm <= 8) return 12;
  if (distanceKm <= 12) return 15;
  return 18;
}

/**
 * Driving route via public OSRM (same OSM ecosystem as Nominatim already used).
 * Returns null on failure — callers fall back to Haversine from checkout.
 */
export async function fetchOsrmRouteKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<{ distanceKm: number; durationMin: number } | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "BurgerGN-Delivery/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{ distance?: number; duration?: number }>;
    };
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const meters = data.routes[0].distance ?? 0;
    const seconds = data.routes[0].duration ?? 0;
    if (!Number.isFinite(meters) || meters <= 0) return null;
    return {
      distanceKm: Math.round((meters / 1000) * 100) / 100,
      durationMin: Math.max(1, Math.round(seconds / 60)),
    };
  } catch {
    return null;
  }
}
