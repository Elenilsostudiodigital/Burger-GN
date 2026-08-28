/**
 * Single source of truth for customer delivery coverage.
 * Both checkout flows (typed address and GPS) must use these rules.
 */

export const DELIVER_IN_REGION_MSG = "Entregamos na sua região.";
export const DO_NOT_DELIVER_MSG = "Não entregamos nesta região.";
export const COVERAGE_UNAVAILABLE_MSG = "Não foi possível verificar a área de entrega.";
export const GEOCODE_CITY_SUFFIX = "Lauro de Freitas, Bahia, Brasil";

export type CoverageStatus =
  | "allowed"
  | "blocked"
  | "outside"
  | "pending"
  | "neighborhood"
  | "unavailable";

export type CoverageResult = {
  status: CoverageStatus;
  allowed: boolean;
  fee: number | null;
  distanceKm: number | null;
  message: string;
  areaName: string | null;
};

export type StreetOverlayInput = {
  known: boolean;
  active?: boolean;
  canRequest?: boolean;
  pending?: boolean;
  notes?: string;
  etaMinutes?: number | null;
  message: string | null;
};

export type StreetOverlayResult = {
  coverage: CoverageResult;
  streetBlocked: boolean;
  canRequestArea: boolean;
  streetNotes: string;
  etaMinutes: number | null;
};

export function buildGeocodeQuery(street: string, number: string, neighborhood: string): string {
  return `${street.trim()}, ${number.trim()}, ${neighborhood.trim()}, ${GEOCODE_CITY_SUFFIX}`;
}

export function allowedCoverage(
  fee: number,
  distanceKm: number | null,
  areaName: string | null = null,
): CoverageResult {
  return {
    status: "allowed",
    allowed: true,
    fee,
    distanceKm,
    message: DELIVER_IN_REGION_MSG,
    areaName,
  };
}

export function outsideCoverage(distanceKm: number | null = null): CoverageResult {
  return {
    status: "outside",
    allowed: false,
    fee: null,
    distanceKm,
    message: DO_NOT_DELIVER_MSG,
    areaName: null,
  };
}

export function blockedCoverage(
  message: string,
  distanceKm: number | null = null,
  areaName: string | null = null,
): CoverageResult {
  return {
    status: "blocked",
    allowed: false,
    fee: null,
    distanceKm,
    message: message || DO_NOT_DELIVER_MSG,
    areaName,
  };
}

export function pendingCoverage(): CoverageResult {
  return {
    status: "pending",
    allowed: false,
    fee: null,
    distanceKm: null,
    message: "",
    areaName: null,
  };
}

export function neighborhoodCoverage(): CoverageResult {
  return {
    status: "neighborhood",
    allowed: false,
    fee: null,
    distanceKm: null,
    message: "",
    areaName: null,
  };
}

export function unavailableCoverage(message = COVERAGE_UNAVAILABLE_MSG): CoverageResult {
  return {
    status: "unavailable",
    allowed: false,
    fee: null,
    distanceKm: null,
    message,
    areaName: null,
  };
}

/**
 * Street registry may attach notes / block inactive streets.
 * It must NEVER flip an allowed coordinate result to "outside"
 * just because OSM reverse-geocode produced a different street name.
 */
export function applyStreetOverlay(
  coverage: CoverageResult | null,
  street: StreetOverlayInput,
): StreetOverlayResult {
  const notes = String(street.notes || "").trim();
  const etaMinutes = street.etaMinutes ?? null;

  if (!coverage || coverage.status === "pending" || coverage.status === "neighborhood") {
    return {
      coverage: coverage ?? pendingCoverage(),
      streetBlocked: false,
      canRequestArea: !!(street.canRequest || street.pending),
      streetNotes: notes,
      etaMinutes,
    };
  }

  if (street.known && street.active === false) {
    return {
      coverage: blockedCoverage(
        street.message ||
          "🔴 Esta rua está temporariamente fora da área de entrega. Escolha outro endereço ou retire na loja.",
        coverage.distanceKm,
        coverage.areaName,
      ),
      streetBlocked: true,
      canRequestArea: false,
      streetNotes: notes,
      etaMinutes,
    };
  }

  return {
    coverage,
    streetBlocked: false,
    canRequestArea: !coverage.allowed && !!(street.canRequest || street.pending),
    streetNotes: notes,
    etaMinutes,
  };
}
