import type { DeliveryArea, DeliveryAreaBBox, DeliveryAreaPolygon } from "@workspace/db";
import { haversineKm } from "./deliveryStreets";

export const OUTSIDE_AREA_MSG = "Não entregamos nesta região.";
export const BLOCKED_AREA_DEFAULT_MSG = "Não entregamos nesta área.";
export const AREA_ANALYSIS_MSG = "Esta região ainda não faz parte da nossa área de entrega.";
export const APPROVED_REGION_MSG = "Esta região já está na área de entrega.";

/** ~1.1 m at the equator — enough to treat drawn-border vertices as inside. */
const EDGE_EPS = 1e-8;

export type ResolveAreaStatus = "disabled" | "outside" | "blocked" | "allowed";

export type ResolveAreaResult = {
  status: ResolveAreaStatus;
  areasEnabled: boolean;
  message: string | null;
  area: {
    id: number;
    name: string;
    color: string;
    status: string;
    blockReason: string;
    notes: string;
  } | null;
  fee: number | null;
  distanceKm: number | null;
};

type Ring = number[][];

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function pointOnSegment(
  lng: number,
  lat: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const cross = (lng - x1) * (y2 - y1) - (lat - y1) * (x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < EDGE_EPS) {
    return Math.hypot(lng - x1, lat - y1) <= EDGE_EPS;
  }
  if (Math.abs(cross) > EDGE_EPS * len) return false;
  const dot = (lng - x1) * (x2 - x1) + (lat - y1) * (y2 - y1);
  if (dot < -EDGE_EPS) return false;
  return dot <= len * len + EDGE_EPS;
}

function pointOnRingEdge(lng: number, lat: number, ring: Ring): boolean {
  if (!Array.isArray(ring) || ring.length < 2) return false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    if (!pi || !pj || pi.length < 2 || pj.length < 2) continue;
    const xi = Number(pi[0]);
    const yi = Number(pi[1]);
    const xj = Number(pj[0]);
    const yj = Number(pj[1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    if (pointOnSegment(lng, lat, xi, yi, xj, yj)) return true;
  }
  return false;
}

/** Ray-casting point-in-ring (ring is closed or open; [lng, lat]). Boundary counts as inside. */
export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  if (pointOnRingEdge(lng, lat, ring)) return true;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    if (!pi || !pj || pi.length < 2 || pj.length < 2) continue;
    const xi = Number(pi[0]);
    const yi = Number(pi[1]);
    const xj = Number(pj[0]);
    const yj = Number(pj[1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const dy = yj - yi;
    if (Math.abs(dy) < EDGE_EPS) continue;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / dy + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lng: number, lat: number, polygon: DeliveryAreaPolygon): boolean {
  if (!polygon || !polygon.type) return false;
  if (polygon.type === "Polygon") {
    const rings = polygon.coordinates;
    if (!Array.isArray(rings) || rings.length === 0) return false;
    const outer = rings[0]!;
    if (!pointInRing(lng, lat, outer)) return false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lng, lat, rings[i]!)) return false; // hole
    }
    return true;
  }
  if (polygon.type === "MultiPolygon") {
    for (const poly of polygon.coordinates || []) {
      if (!Array.isArray(poly) || poly.length === 0) continue;
      const asPoly: DeliveryAreaPolygon = { type: "Polygon", coordinates: poly };
      if (pointInPolygon(lng, lat, asPoly)) return true;
    }
  }
  return false;
}

function ringBbox(ring: Ring): DeliveryAreaBBox | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const pt of ring) {
    if (!pt || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

export function computeBbox(polygon: DeliveryAreaPolygon): DeliveryAreaBBox | null {
  if (!polygon) return null;
  if (polygon.type === "Polygon") {
    const outer = polygon.coordinates?.[0];
    return outer ? ringBbox(outer) : null;
  }
  if (polygon.type === "MultiPolygon") {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const poly of polygon.coordinates || []) {
      const bb = ringBbox(poly?.[0] || []);
      if (!bb) continue;
      if (bb[0] < minLng) minLng = bb[0];
      if (bb[1] < minLat) minLat = bb[1];
      if (bb[2] > maxLng) maxLng = bb[2];
      if (bb[3] > maxLat) maxLat = bb[3];
    }
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
    return [minLng, minLat, maxLng, maxLat];
  }
  return null;
}

function bboxContains(bbox: DeliveryAreaBBox | null | undefined, lng: number, lat: number): boolean {
  if (!bbox || bbox.length < 4) return true; // no bbox → skip prefilter
  return lng >= bbox[0] && lat >= bbox[1] && lng <= bbox[2] && lat <= bbox[3];
}

/** Absolute shoelace area in deg² (for tie-break only). */
export function polygonAreaAbs(polygon: DeliveryAreaPolygon): number {
  const rings: Ring[] = [];
  if (polygon.type === "Polygon") {
    if (polygon.coordinates?.[0]) rings.push(polygon.coordinates[0]);
  } else if (polygon.type === "MultiPolygon") {
    for (const p of polygon.coordinates || []) {
      if (p?.[0]) rings.push(p[0]);
    }
  }
  let total = 0;
  for (const ring of rings) {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]!;
      const b = ring[i + 1]!;
      sum += Number(a[0]) * Number(b[1]) - Number(b[0]) * Number(a[1]);
    }
    total += Math.abs(sum) / 2;
  }
  return total;
}

export function normalizePolygon(raw: unknown): DeliveryAreaPolygon | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as DeliveryAreaPolygon;
  if (p.type === "Polygon" && Array.isArray(p.coordinates) && p.coordinates.length > 0) {
    const outer = p.coordinates[0];
    if (!Array.isArray(outer) || outer.length < 4) return null;
    return { type: "Polygon", coordinates: p.coordinates };
  }
  if (p.type === "MultiPolygon" && Array.isArray(p.coordinates) && p.coordinates.length > 0) {
    return { type: "MultiPolygon", coordinates: p.coordinates };
  }
  // Leaflet/Geoman Feature wrapper
  const feat = raw as { type?: string; geometry?: DeliveryAreaPolygon };
  if (feat.type === "Feature" && feat.geometry) return normalizePolygon(feat.geometry);
  return null;
}

export function calcAreaFee(minFee: number, feePerKm: number, distanceKm: number): number {
  const min = Number.isFinite(minFee) ? Math.max(0, minFee) : 0;
  const per = Number.isFinite(feePerKm) ? Math.max(0, feePerKm) : 0;
  const dist = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  return parseFloat(Math.max(min, per * dist).toFixed(2));
}

function serializeAreaHit(area: DeliveryArea) {
  return {
    id: area.id,
    name: area.name,
    color: area.color,
    status: area.status,
    blockReason: area.blockReason || "",
    notes: area.notes || "",
  };
}

/**
 * Resolve which delivery area contains (lng, lat).
 * Rules:
 * - Only `enabled` areas participate
 * - Blocked (red) always prevails over active when point is inside both
 * - Among active: highest priority, then smallest polygon area
 */
export function resolvePointInAreas(opts: {
  areasEnabled: boolean;
  areas: DeliveryArea[];
  lat: number;
  lng: number;
  baseLat: number;
  baseLng: number;
}): ResolveAreaResult {
  const { areasEnabled, areas, lat, lng, baseLat, baseLng } = opts;

  if (!areasEnabled) {
    return {
      status: "disabled",
      areasEnabled: false,
      message: null,
      area: null,
      fee: null,
      distanceKm: null,
    };
  }

  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return {
      status: "outside",
      areasEnabled: true,
      message: OUTSIDE_AREA_MSG,
      area: null,
      fee: null,
      distanceKm: null,
    };
  }

  const enabled = areas.filter((a) => a.enabled);
  const containing: DeliveryArea[] = [];
  for (const area of enabled) {
    // Always derive bbox from the live polygon so a stale stored bbox cannot
    // skip a point that is actually inside the drawn area.
    const bbox = computeBbox(area.polygon) ?? area.bbox;
    if (!bboxContains(bbox, lng, lat)) continue;
    if (!pointInPolygon(lng, lat, area.polygon)) continue;
    containing.push(area);
  }

  if (containing.length === 0) {
    return {
      status: "outside",
      areasEnabled: true,
      message: OUTSIDE_AREA_MSG,
      area: null,
      fee: null,
      distanceKm: null,
    };
  }

  // Red / blocked always wins
  const blocked = containing.filter((a) => a.status === "blocked");
  if (blocked.length > 0) {
    const chosen =
      [...blocked].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0] ?? blocked[0]!;
    const reason = (chosen.blockReason || "").trim() || BLOCKED_AREA_DEFAULT_MSG;
    return {
      status: "blocked",
      areasEnabled: true,
      message: reason,
      area: serializeAreaHit(chosen),
      fee: null,
      distanceKm: null,
    };
  }

  const active = containing.filter((a) => a.status === "active");
  if (active.length === 0) {
    return {
      status: "outside",
      areasEnabled: true,
      message: OUTSIDE_AREA_MSG,
      area: null,
      fee: null,
      distanceKm: null,
    };
  }

  active.sort((a, b) => {
    const p = (b.priority ?? 0) - (a.priority ?? 0);
    if (p !== 0) return p;
    return polygonAreaAbs(a.polygon) - polygonAreaAbs(b.polygon);
  });
  const chosen = active[0]!;

  let distanceKm: number | null = null;
  if (
    isFiniteNumber(baseLat) &&
    isFiniteNumber(baseLng) &&
    !(baseLat === 0 && baseLng === 0)
  ) {
    distanceKm = parseFloat(haversineKm(baseLat, baseLng, lat, lng).toFixed(2));
  }

  // Point inside the drawn green polygon is covered. maxDistanceKm must not
  // convert an in-area location into "outside" (that hid Itinga addresses).
  const minFee = parseFloat(String(chosen.minFee ?? 0));
  const feePerKm = parseFloat(String(chosen.feePerKm ?? 0));
  const fee = calcAreaFee(minFee, feePerKm, distanceKm ?? 0);

  return {
    status: "allowed",
    areasEnabled: true,
    message: null,
    area: serializeAreaHit(chosen),
    fee,
    distanceKm,
  };
}

export type CoverageStreet = {
  active: boolean;
  fee: number | null;
  distanceKm: number | null;
  etaMinutes: number | null;
};

export type CoverageSource = "polygon" | "street" | "none";

export type CoverageResult = ResolveAreaResult & {
  source: CoverageSource;
  canRequest: boolean;
  inDeliveryArea: boolean;
};

/**
 * Single coverage decision used by street-check, analysis requests and orders.
 *
 * When áreas de entrega are enabled:
 * 1. Point inside a blocked (red) polygon → blocked (no analysis)
 * 2. Inactive registered street → blocked
 * 3. Point inside an active (green) polygon → allowed automatically
 * 4. Approved active street → allowed (admin analysis already done)
 * 5. Else → outside, customer may request analysis
 */
export function evaluateDeliveryCoverage(opts: {
  areasEnabled: boolean;
  areas: DeliveryArea[];
  lat: number | null;
  lng: number | null;
  baseLat: number;
  baseLng: number;
  knownStreet: CoverageStreet | null;
}): CoverageResult {
  const { areasEnabled, areas, lat, lng, baseLat, baseLng, knownStreet } = opts;

  if (!areasEnabled) {
    return {
      status: "disabled",
      areasEnabled: false,
      message: null,
      area: null,
      fee: null,
      distanceKm: null,
      source: "none",
      canRequest: false,
      inDeliveryArea: false,
    };
  }

  const hasCoords = isFiniteNumber(lat) && isFiniteNumber(lng);
  const polygon = hasCoords
    ? resolvePointInAreas({
        areasEnabled: true,
        areas,
        lat: lat as number,
        lng: lng as number,
        baseLat,
        baseLng,
      })
    : null;

  if (polygon?.status === "blocked") {
    return {
      ...polygon,
      source: "polygon",
      canRequest: false,
      inDeliveryArea: false,
    };
  }

  if (knownStreet && !knownStreet.active) {
    return {
      status: "blocked",
      areasEnabled: true,
      message:
        "Esta rua está temporariamente fora da área de entrega. Escolha outro endereço ou retire na loja.",
      area: polygon?.area ?? null,
      fee: null,
      distanceKm: knownStreet.distanceKm,
      source: "street",
      canRequest: false,
      inDeliveryArea: false,
    };
  }

  if (polygon?.status === "allowed") {
    return {
      ...polygon,
      source: "polygon",
      canRequest: false,
      inDeliveryArea: true,
    };
  }

  if (knownStreet?.active && knownStreet.fee != null && Number.isFinite(knownStreet.fee)) {
    let distanceKm = knownStreet.distanceKm;
    if (
      distanceKm == null &&
      hasCoords &&
      isFiniteNumber(baseLat) &&
      isFiniteNumber(baseLng) &&
      !(baseLat === 0 && baseLng === 0)
    ) {
      distanceKm = parseFloat(haversineKm(baseLat, baseLng, lat as number, lng as number).toFixed(2));
    }
    return {
      status: "allowed",
      areasEnabled: true,
      message: null,
      area: polygon?.area ?? null,
      fee: knownStreet.fee,
      distanceKm,
      source: "street",
      canRequest: false,
      inDeliveryArea: false,
    };
  }

  return {
    status: "outside",
    areasEnabled: true,
    message: AREA_ANALYSIS_MSG,
    area: null,
    fee: null,
    distanceKm: polygon?.distanceKm ?? knownStreet?.distanceKm ?? null,
    source: "none",
    canRequest: true,
    inDeliveryArea: false,
  };
}
