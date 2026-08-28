/**
 * The only customer-facing delivery coverage function.
 * Typed address and "Usar minha localização" must both call this with lat/lng.
 */
import {
  findKmTier,
  haversineKm,
  resolveDeliveryArea,
  type KmDeliveryConfig,
  type ResolveAreaResult,
} from "./api";
import {
  allowedCoverage,
  blockedCoverage,
  neighborhoodCoverage,
  outsideCoverage,
  pendingCoverage,
  unavailableCoverage,
  type CoverageResult,
} from "./deliveryCoverageRules";

export type { CoverageResult } from "./deliveryCoverageRules";
export {
  DELIVER_IN_REGION_MSG,
  DO_NOT_DELIVER_MSG,
  buildGeocodeQuery,
  applyStreetOverlay,
} from "./deliveryCoverageRules";

function fromAreaApi(result: ResolveAreaResult): CoverageResult {
  if (result.status === "allowed" && result.fee != null && Number.isFinite(result.fee)) {
    return allowedCoverage(result.fee, result.distanceKm, result.area?.name ?? null);
  }
  if (result.status === "blocked") {
    return blockedCoverage(
      result.message || "Não entregamos nesta área.",
      result.distanceKm,
      result.area?.name ?? null,
    );
  }
  if (result.status === "disabled") {
    return neighborhoodCoverage();
  }
  return outsideCoverage(result.distanceKm);
}

function fromKmConfig(
  lat: number,
  lng: number,
  kmConfig: KmDeliveryConfig,
): CoverageResult {
  const baseLat = parseFloat(String(kmConfig.baseLat ?? "0"));
  const baseLng = parseFloat(String(kmConfig.baseLng ?? "0"));
  if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng) || (baseLat === 0 && baseLng === 0)) {
    return unavailableCoverage("Local da loja não configurado para cálculo por KM. Consulte a taxa com a loja.");
  }

  const dist = haversineKm(baseLat, baseLng, lat, lng);
  if (!Number.isFinite(dist)) {
    return unavailableCoverage("Não foi possível calcular a distância. Consulte a taxa com a loja.");
  }
  const distanceKm = parseFloat(dist.toFixed(2));

  const maxDist = parseFloat(String(kmConfig.maxDistanceKm ?? "0"));
  if (Number.isFinite(maxDist) && maxDist > 0 && dist > maxDist) {
    return outsideCoverage(distanceKm);
  }

  const { fee, consult } = findKmTier(dist, kmConfig.tiers);
  if (!consult && fee !== null && Number.isFinite(fee)) {
    return allowedCoverage(fee, distanceKm);
  }
  return outsideCoverage(distanceKm);
}

/**
 * Validate whether (lat, lng) is inside the delivery area.
 * Priority: drawn polygons (áreas) → KM radius/tiers → neighborhood fallback.
 */
export async function validateDeliveryCoverage(
  lat: number,
  lng: number,
  kmConfig: KmDeliveryConfig | null,
): Promise<CoverageResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return unavailableCoverage();
  }
  if (!kmConfig) return pendingCoverage();

  if (kmConfig.areasEnabled) {
    try {
      const result = await resolveDeliveryArea(lat, lng);
      if (result.status === "disabled") {
        if (kmConfig.enabled) return fromKmConfig(lat, lng, kmConfig);
        return neighborhoodCoverage();
      }
      return fromAreaApi(result);
    } catch {
      return unavailableCoverage();
    }
  }

  if (kmConfig.enabled) {
    return fromKmConfig(lat, lng, kmConfig);
  }

  return neighborhoodCoverage();
}
