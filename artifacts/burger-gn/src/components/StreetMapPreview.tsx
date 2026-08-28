/**
 * Embedded map preview for address / region requests.
 *
 * Uses Leaflet with a stable host div (never remounted) — same contract as
 * DeliveryAreasAdmin to avoid React insertBefore errors.
 * No iframe. Tiles: OpenStreetMap (map) + Esri World Imagery (satellite).
 */
import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type StreetMapPreviewProps = {
  lat: number | null;
  lng: number | null;
  loading?: boolean;
  message?: string;
  /** Optional human-readable address shown under the map */
  address?: string;
  /** Fallback center when there is no pin yet (store location). */
  centerLat?: number | null;
  centerLng?: number | null;
  /** When set, tapping the map drops the delivery pin. */
  onPick?: (lat: number, lng: number) => void;
};

type BaseLayer = "map" | "satellite";

const ADDRESS_ZOOM = 16;
const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
const SAT_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_ATTR = "Tiles &copy; Esri";

/** Leaflet must invalidateSize first, then setView — otherwise tiles stay clipped. */
function fitCustomerView(map: L.Map, lat: number | null, lng: number | null) {
  try {
    map.invalidateSize({ animate: false });
  } catch {
    /* ignore */
  }
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  map.setView([lat, lng], ADDRESS_ZOOM, { animate: false });
}

function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: "bgn-street-map-pin",
    html: `<div style="
      width:18px;height:18px;border-radius:50% 50% 50% 0;
      background:#f59e0b;border:2px solid #fff;
      transform:rotate(-45deg);
      box-shadow:0 1px 4px rgba(0,0,0,.45);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
  });
}

export function StreetMapPreview({
  lat,
  lng,
  loading = false,
  message = "",
  address = "",
  centerLat = null,
  centerLng = null,
  onPick,
}: StreetMapPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [base, setBase] = useState<BaseLayer>("map");

  const hasCoords =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  coordsRef.current =
    hasCoords && lat != null && lng != null ? { lat, lng } : null;
  const coordText =
    hasCoords && lat != null && lng != null
      ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      : "—";

  // Create map once
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const host = hostRef.current;
    const start = coordsRef.current;
    const center =
      centerLat != null && centerLng != null && Number.isFinite(centerLat) && Number.isFinite(centerLng)
        ? { lat: centerLat, lng: centerLng }
        : null;
    const map = L.map(host, {
      zoomControl: true,
      attributionControl: true,
    }).setView(
      start ? [start.lat, start.lng] : center ? [center.lat, center.lng] : [-12.89444, -38.32722],
      start ? ADDRESS_ZOOM : 13,
    );

    const osm = L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_ATTR });
    const sat = L.tileLayer(SAT_URL, { maxZoom: 19, attribution: SAT_ATTR });
    osm.addTo(map);
    osmLayerRef.current = osm;
    satLayerRef.current = sat;
    mapRef.current = map;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      onPickRef.current?.(e.latlng.lat, e.latlng.lng);
    };
    map.on("click", onMapClick);

    const syncSize = () => {
      const c = coordsRef.current;
      fitCustomerView(map, c?.lat ?? center?.lat ?? null, c?.lng ?? center?.lng ?? null);
    };

    const onResize = () => syncSize();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // Panel/card often finishes CSS layout after the first paint (grid / hidden→visible).
    const raf = requestAnimationFrame(syncSize);
    const t1 = window.setTimeout(syncSize, 80);
    const t2 = window.setTimeout(syncSize, 250);
    const t3 = window.setTimeout(syncSize, 500);

    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      try {
        map.remove();
      } catch { /* ignore */ }
      mapRef.current = null;
      markerRef.current = null;
      osmLayerRef.current = null;
      satLayerRef.current = null;
    };
  }, []);

  // Toggle base layer
  useEffect(() => {
    const map = mapRef.current;
    const osm = osmLayerRef.current;
    const sat = satLayerRef.current;
    if (!map || !osm || !sat) return;
    if (base === "map") {
      if (map.hasLayer(sat)) map.removeLayer(sat);
      if (!map.hasLayer(osm)) osm.addTo(map);
    } else {
      if (map.hasLayer(osm)) map.removeLayer(osm);
      if (!map.hasLayer(sat)) sat.addTo(map);
    }
    requestAnimationFrame(() => {
      const c = coordsRef.current;
      fitCustomerView(map, c?.lat ?? null, c?.lng ?? null);
    });
  }, [base]);

  // Marker + center when coords change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!hasCoords || lat == null || lng == null) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      if (
        centerLat != null &&
        centerLng != null &&
        Number.isFinite(centerLat) &&
        Number.isFinite(centerLng)
      ) {
        map.setView([centerLat, centerLng], 13, { animate: false });
      }
      return;
    }

    const pos: L.LatLngExpression = [lat, lng];
    if (!markerRef.current) {
      markerRef.current = L.marker(pos, { icon: pinIcon() }).addTo(map);
    } else {
      markerRef.current.setLatLng(pos);
    }
    fitCustomerView(map, lat, lng);
    requestAnimationFrame(() => fitCustomerView(map, lat, lng));
    const t = window.setTimeout(() => fitCustomerView(map, lat, lng), 200);
    return () => window.clearTimeout(t);
  }, [hasCoords, lat, lng, centerLat, centerLng]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      <style>{`
        .bgn-street-map-host.leaflet-container {
          width: 100%;
          height: 100%;
          background: #09090b;
        }
        .bgn-street-map-host img.leaflet-tile {
          max-width: none !important;
          max-height: none !important;
        }
      `}</style>
      <div className="flex items-center gap-2 border-b border-zinc-800 px-2 py-1.5 bg-zinc-900/80">
        <button
          type="button"
          onClick={() => setBase("map")}
          className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide ${
            base === "map"
              ? "bg-amber-500 text-zinc-950"
              : "bg-zinc-800 text-zinc-300 hover:text-white"
          }`}
        >
          Mapa
        </button>
        <button
          type="button"
          onClick={() => setBase("satellite")}
          className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide ${
            base === "satellite"
              ? "bg-amber-500 text-zinc-950"
              : "bg-zinc-800 text-zinc-300 hover:text-white"
          }`}
        >
          Satélite
        </button>
      </div>

      <div className="relative h-[360px] md:h-[420px] bg-zinc-950">
        {/* Host always mounted — Leaflet owns children inside */}
        <div
          ref={hostRef}
          className={`bgn-street-map-host absolute inset-0 z-0 h-full w-full ${showMapShell(hasCoords, loading, !!onPick)} ${onPick ? "cursor-crosshair" : ""}`}
          aria-label={hasCoords ? "Mapa da localização" : "Mapa"}
        />

        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center bg-zinc-950/90 ${
            (hasCoords || onPick) && !loading ? "invisible pointer-events-none" : ""
          }`}
          aria-hidden={(hasCoords || !!onPick) && !loading}
        >
          <p className={`text-amber-500 text-sm font-bold ${loading ? "" : "invisible"}`}>
            Localizando endereço…
          </p>
          <p className={`text-zinc-500 text-sm ${loading ? "invisible" : ""}`}>
            Mapa do endereço
          </p>
          <p className={`text-zinc-600 text-xs ${loading ? "invisible" : ""}`}>
            {message || "Aguardando coordenadas da solicitação."}
          </p>
        </div>
      </div>

      <div className="border-t border-zinc-800 px-3 py-2.5 space-y-1 min-h-[3.25rem]">
        <p className={`text-zinc-300 text-xs ${address.trim() ? "" : "invisible"}`}>
          Endereço: <span className="text-white">{address.trim() || "—"}</span>
        </p>
        <p className={`text-zinc-300 text-xs ${hasCoords ? "" : "invisible"}`}>
          Latitude:{" "}
          <span className="text-white font-mono">
            {hasCoords && lat != null ? lat.toFixed(6) : "—"}
          </span>
        </p>
        <p className={`text-zinc-300 text-xs ${hasCoords ? "" : "invisible"}`}>
          Longitude:{" "}
          <span className="text-white font-mono">
            {hasCoords && lng != null ? lng.toFixed(6) : "—"}
          </span>
        </p>
        <p className={`text-zinc-500 text-[10px] font-mono ${hasCoords ? "" : "invisible"}`}>
          {coordText}
        </p>
        <p className={`text-zinc-600 text-xs ${hasCoords ? "invisible" : ""}`}>
          {onPick
            ? "Toque no mapa no ponto da sua casa para calcular a taxa."
            : message || "Nenhum ponto selecionado ainda."}
        </p>
      </div>
    </div>
  );
}

function showMapShell(hasCoords: boolean, loading: boolean, pickable: boolean): string {
  if (loading) return "opacity-0";
  if (hasCoords || pickable) return "opacity-100";
  return "opacity-0";
}
