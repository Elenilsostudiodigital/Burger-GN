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
};

type BaseLayer = "map" | "satellite";

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
const SAT_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_ATTR = "Tiles &copy; Esri";

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
}: StreetMapPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);
  const [base, setBase] = useState<BaseLayer>("map");

  const hasCoords =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const coordText =
    hasCoords && lat != null && lng != null
      ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      : "—";

  // Create map once
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([-12.89444, -38.32722], 13);

    const osm = L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_ATTR });
    const sat = L.tileLayer(SAT_URL, { maxZoom: 19, attribution: SAT_ATTR });
    osm.addTo(map);
    osmLayerRef.current = osm;
    satLayerRef.current = sat;
    mapRef.current = map;

    const onResize = () => {
      try {
        map.invalidateSize();
      } catch { /* ignore */ }
    };
    window.addEventListener("resize", onResize);
    requestAnimationFrame(onResize);

    return () => {
      window.removeEventListener("resize", onResize);
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
      try {
        map.invalidateSize();
      } catch { /* ignore */ }
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
      return;
    }

    const pos: L.LatLngExpression = [lat, lng];
    if (!markerRef.current) {
      markerRef.current = L.marker(pos, { icon: pinIcon() }).addTo(map);
    } else {
      markerRef.current.setLatLng(pos);
    }
    map.setView(pos, Math.max(map.getZoom(), 16));
    requestAnimationFrame(() => {
      try {
        map.invalidateSize();
      } catch { /* ignore */ }
    });
  }, [hasCoords, lat, lng]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
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

      <div className="relative h-[240px] bg-zinc-950">
        {/* Host always mounted — Leaflet owns children inside */}
        <div
          ref={hostRef}
          className={`absolute inset-0 z-0 ${showMapShell(hasCoords, loading)}`}
          aria-label={hasCoords ? "Mapa da localização" : "Mapa"}
        />

        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center bg-zinc-950/90 ${
            hasCoords && !loading ? "invisible pointer-events-none" : ""
          }`}
          aria-hidden={hasCoords && !loading}
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
          {message || "Nenhum ponto selecionado ainda."}
        </p>
      </div>
    </div>
  );
}

function showMapShell(hasCoords: boolean, loading: boolean): string {
  return hasCoords && !loading ? "opacity-100" : "opacity-0";
}
