/**
 * Áreas de Entrega — admin map panel (Leaflet + Geoman).
 *
 * Flow: Desenhar → Finalizar (Geoman) → formulário → Salvar Área → DB
 * Areas are always reloaded from the API on mount and after save/delete.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  listAdminDeliveryAreas,
  createAdminDeliveryArea,
  updateAdminDeliveryArea,
  toggleAdminDeliveryArea,
  deleteAdminDeliveryArea,
  getAdminDeliveryAreasSettings,
  updateAdminDeliveryAreasSettings,
  DeliveryArea,
  DeliveryAreaPolygon,
} from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, Check, X } from "lucide-react";

const DEFAULT_CENTER: [number, number] = [-12.89444, -38.32722];

type FormState = {
  name: string;
  color: string;
  status: "active" | "blocked";
  blockReason: string;
  minFee: string;
  feePerKm: string;
  maxDistanceKm: string;
  notes: string;
  priority: string;
};

type FormMode = "create" | "edit" | null;

const emptyForm = (status: "active" | "blocked" = "active"): FormState => ({
  name: "",
  color: status === "blocked" ? "#ef4444" : "#22c55e",
  status,
  blockReason: "",
  minFee: "5.00",
  feePerKm: "2.00",
  maxDistanceKm: "",
  notes: "",
  priority: "0",
});

/** Extract Polygon/MultiPolygon from Leaflet layer / GeoJSON / Feature / FeatureCollection. */
function polygonFromUnknown(raw: unknown): DeliveryAreaPolygon | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (obj.type === "Polygon" && Array.isArray(obj.coordinates)) {
    const coords = obj.coordinates as number[][][];
    if (!coords[0] || coords[0].length < 4) return null;
    return { type: "Polygon", coordinates: coords };
  }
  if (obj.type === "MultiPolygon" && Array.isArray(obj.coordinates)) {
    return { type: "MultiPolygon", coordinates: obj.coordinates as number[][][][] };
  }
  if (obj.type === "Feature") {
    return polygonFromUnknown(obj.geometry);
  }
  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    for (const f of obj.features as unknown[]) {
      const p = polygonFromUnknown(f);
      if (p) return p;
    }
  }
  if ("geometry" in obj) return polygonFromUnknown(obj.geometry);
  return null;
}

function polygonFromLayer(layer: L.Layer): DeliveryAreaPolygon | null {
  const anyLayer = layer as L.Layer & {
    toGeoJSON?: () => unknown;
    getLatLngs?: () => unknown;
  };

  const fromGeo = polygonFromUnknown(anyLayer.toGeoJSON?.());
  if (fromGeo) return fromGeo;

  // Fallback: build ring from Leaflet latlngs
  try {
    const latlngs = anyLayer.getLatLngs?.();
    const ringSrc = Array.isArray(latlngs)
      ? Array.isArray(latlngs[0])
        ? (Array.isArray((latlngs[0] as unknown[])[0])
            ? (latlngs[0] as L.LatLng[])
            : (latlngs as L.LatLng[]))
        : (latlngs as L.LatLng[])
      : null;
    // Prefer first ring of polygon
    let ring: L.LatLng[] | null = null;
    if (Array.isArray(latlngs) && latlngs.length > 0) {
      const first = latlngs[0];
      if (first && typeof first === "object" && "lat" in (first as object)) {
        ring = latlngs as L.LatLng[];
      } else if (Array.isArray(first)) {
        const inner = first[0];
        if (inner && typeof inner === "object" && "lat" in (inner as object)) {
          ring = first as L.LatLng[];
        } else if (Array.isArray(first) && first.length && typeof first[0] === "object" && "lat" in (first[0] as object)) {
          ring = first as L.LatLng[];
        }
      }
    }
    if (!ring && ringSrc) ring = ringSrc;
    if (!ring || ring.length < 3) return null;
    const coords = ring.map((ll) => [ll.lng, ll.lat] as number[]);
    const first = coords[0]!;
    const last = coords[coords.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([first[0]!, first[1]!]);
    }
    if (coords.length < 4) return null;
    return { type: "Polygon", coordinates: [coords] };
  } catch {
    return null;
  }
}

function formFromArea(area: DeliveryArea): FormState {
  return {
    name: area.name,
    color: area.color || "#22c55e",
    status: area.status === "blocked" ? "blocked" : "active",
    blockReason: area.blockReason || "",
    minFee: String(area.minFee ?? "0"),
    feePerKm: String(area.feePerKm ?? "0"),
    maxDistanceKm: area.maxDistanceKm != null ? String(area.maxDistanceKm) : "",
    notes: area.notes || "",
    priority: String(area.priority ?? 0),
  };
}

export default function DeliveryAreasAdmin() {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const draftLayerRef = useRef<L.Layer | null>(null);
  const areasRef = useRef<DeliveryArea[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [areasEnabled, setAreasEnabled] = useState(false);
  const [baseLat, setBaseLat] = useState(DEFAULT_CENTER[0]);
  const [baseLng, setBaseLng] = useState(DEFAULT_CENTER[1]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftPolygon, setDraftPolygon] = useState<DeliveryAreaPolygon | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  areasRef.current = areas;

  const openForm = useCallback((mode: FormMode, opts?: { scroll?: boolean }) => {
    setFormMode(mode);
    if (opts?.scroll !== false) {
      requestAnimationFrame(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, []);

  const clearDraftLayer = useCallback(() => {
    const map = mapRef.current;
    if (draftLayerRef.current && map) {
      try {
        map.removeLayer(draftLayerRef.current);
      } catch {
        /* ignore */
      }
    }
    draftLayerRef.current = null;
  }, []);

  const paintAreasOnMap = useCallback(
    (list: DeliveryArea[], highlightId: number | null) => {
      const map = mapRef.current;
      const group = layerGroupRef.current;
      if (!map || !group) return;
      group.clearLayers();

      for (const area of list) {
        try {
          const gj = L.geoJSON(area.polygon as GeoJSON.GeoJsonObject, {
            style: {
              color: area.color || "#22c55e",
              weight: highlightId === area.id ? 3 : 2,
              fillColor: area.color || "#22c55e",
              fillOpacity: area.enabled ? (area.status === "blocked" ? 0.35 : 0.25) : 0.08,
              opacity: area.enabled ? 1 : 0.35,
              dashArray: area.enabled ? undefined : "4 6",
            },
            onEachFeature: (_feature, layer) => {
              layer.on("click", () => {
                clearDraftLayer();
                setDraftPolygon(null);
                setDrawing(false);
                map.pm.disableDraw();
                setSelectedId(area.id);
                setEditingId(area.id);
                setForm(formFromArea(area));
                openForm("edit");
              });
            },
          });
          group.addLayer(gj);
        } catch {
          /* skip bad polygon */
        }
      }
    },
    [clearDraftLayer, openForm],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, settings] = await Promise.all([
        listAdminDeliveryAreas(),
        getAdminDeliveryAreasSettings(),
      ]);
      const rows = Array.isArray(list) ? list : [];
      setAreas(rows);
      setAreasEnabled(Boolean(settings.areasEnabled));
      if (
        Number.isFinite(settings.baseLat) &&
        Number.isFinite(settings.baseLng) &&
        !(settings.baseLat === 0 && settings.baseLng === 0)
      ) {
        setBaseLat(settings.baseLat);
        setBaseLng(settings.baseLng);
      }
      return rows;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar áreas");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Init map
  useEffect(() => {
    if (!mapHostRef.current || mapRef.current) return;

    const map = L.map(mapHostRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([baseLat, baseLng], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;

    map.pm.setLang("pt_br");
    map.pm.addControls({
      position: "topleft",
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false,
    });

    const onCreate = (e: unknown) => {
      const ev = e as { layer?: L.Layer; shape?: string };
      const layer = ev.layer;
      if (!layer) return;

      clearDraftLayer();
      draftLayerRef.current = layer;

      const poly = polygonFromLayer(layer);
      setDraftPolygon(poly);
      setDrawing(false);
      setSelectedId(null);
      setEditingId(null);
      setForm(emptyForm("active"));
      setError(poly ? "" : "Polígono inválido. Desenhe novamente com pelo menos 3 pontos.");
      setSuccess("");
      openForm("create");
      map.pm.disableDraw();
    };

    map.on("pm:create", onCreate as L.LeafletEventHandlerFn);

    mapRef.current = map;
    setMapReady(true);
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.off("pm:create", onCreate as L.LeafletEventHandlerFn);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      draftLayerRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([baseLat, baseLng], map.getZoom() || 13);
  }, [baseLat, baseLng]);

  // Always repaint saved areas when list/map/selection changes
  useEffect(() => {
    if (!mapReady) return;
    paintAreasOnMap(areas, selectedId);
  }, [areas, selectedId, mapReady, paintAreasOnMap]);

  const startDraw = () => {
    const map = mapRef.current;
    if (!map) return;
    clearDraftLayer();
    setDraftPolygon(null);
    setDrawing(true);
    setEditingId(null);
    setSelectedId(null);
    setFormMode(null);
    setForm(emptyForm("active"));
    setError("");
    setSuccess("");
    map.pm.enableDraw("Polygon", { snappable: true, allowSelfIntersection: false });
  };

  const cancelDraft = () => {
    const map = mapRef.current;
    clearDraftLayer();
    map?.pm.disableDraw();
    setDraftPolygon(null);
    setDrawing(false);
    setFormMode(null);
    setEditingId(null);
    setForm(emptyForm());
    setError("");
  };

  const handleToggleSystem = async () => {
    try {
      const next = !areasEnabled;
      const res = await updateAdminDeliveryAreasSettings(next);
      setAreasEnabled(Boolean(res.areasEnabled));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  };

  const handleQuickToggle = async (area: DeliveryArea) => {
    try {
      const updated = await toggleAdminDeliveryArea(area.id, !area.enabled);
      setAreas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setSuccess(updated.enabled ? "Área ligada." : "Área desligada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ligar/desligar");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!form.name.trim()) {
        setError("Informe o nome da área.");
        setSaving(false);
        return;
      }
      if (form.status === "blocked" && !form.blockReason.trim()) {
        setError("Informe o motivo do bloqueio.");
        setSaving(false);
        return;
      }

      if (formMode === "edit" && editingId != null) {
        const updated = await updateAdminDeliveryArea(editingId, {
          name: form.name.trim(),
          color: form.color,
          status: form.status,
          blockReason: form.blockReason.trim(),
          minFee: form.minFee,
          feePerKm: form.feePerKm,
          maxDistanceKm: form.maxDistanceKm.trim() || null,
          notes: form.notes.trim(),
          priority: Number(form.priority) || 0,
        });
        await refresh();
        setSelectedId(updated.id);
        setEditingId(updated.id);
        setForm(formFromArea(updated));
        openForm("edit", { scroll: false });
        setSuccess("Área atualizada.");
      } else {
        // Prefer live geometry from the draft layer; fall back to state
        let polygon =
          (draftLayerRef.current ? polygonFromLayer(draftLayerRef.current) : null) || draftPolygon;
        if (!polygon) {
          setError("Desenhe e finalize a área no mapa antes de salvar.");
          setSaving(false);
          return;
        }
        const created = await createAdminDeliveryArea({
          name: form.name.trim(),
          color: form.color,
          status: form.status,
          blockReason: form.blockReason.trim(),
          minFee: form.minFee,
          feePerKm: form.feePerKm,
          maxDistanceKm: form.maxDistanceKm.trim() || null,
          notes: form.notes.trim(),
          priority: Number(form.priority) || 0,
          polygon,
          enabled: true,
          city: "Lauro de Freitas",
        });
        clearDraftLayer();
        setDraftPolygon(null);
        await refresh();
        setSelectedId(created.id);
        setEditingId(created.id);
        setForm(formFromArea(created));
        openForm("edit", { scroll: false });
        setSuccess("Área salva com sucesso.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar área");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir esta área permanentemente?")) return;
    try {
      await deleteAdminDeliveryArea(id);
      if (editingId === id) {
        setEditingId(null);
        setSelectedId(null);
        setFormMode(null);
        setForm(emptyForm());
      }
      await refresh();
      setSuccess("Área excluída.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const showForm = formMode === "create" || formMode === "edit";

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl p-4 border transition-all ${
          areasEnabled ? "bg-emerald-500/10 border-emerald-500/30" : "bg-zinc-900 border-zinc-800"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-black uppercase tracking-wide text-sm">Áreas de Entrega</h2>
            <p className="text-zinc-500 text-xs mt-0.5">
              {areasEnabled
                ? "Ativo no checkout — cobertura por polígono no mapa"
                : "Inativo — checkout usa bairro / KM / ruas"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleSystem()}
            className={areasEnabled ? "text-emerald-400" : "text-zinc-600"}
          >
            {areasEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
          </button>
        </div>
      </div>

      <p className="text-zinc-500 text-xs leading-relaxed">
        Toque em <span className="text-zinc-300 font-bold">Desenhar área</span>, marque os pontos no
        mapa e toque em <span className="text-zinc-300 font-bold">Finalizar</span>. Em seguida
        preencha o formulário e salve.
      </p>

      <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950">
        <div ref={mapHostRef} className="w-full h-[320px] sm:h-[420px] z-0" />
      </div>

      {drawing && (
        <p className="text-amber-400 text-xs font-bold text-center">
          Desenhando… toque nos vértices e finalize o polígono no mapa.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={startDraw}
          disabled={drawing}
          className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
        >
          <Plus size={16} className="mr-1" /> Desenhar área
        </Button>
        {(drawing || formMode === "create") && (
          <Button
            type="button"
            variant="outline"
            onClick={cancelDraft}
            className="h-11 rounded-xl border-zinc-700 text-zinc-300"
          >
            <X size={16} />
          </Button>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}
      {success && !error && (
        <p className="text-emerald-400 text-sm" role="status">
          {success}
        </p>
      )}

      <section
        ref={formRef}
        className={`rounded-2xl border border-amber-500/40 bg-zinc-900 p-4 space-y-3 ${
          showForm ? "" : "hidden"
        }`}
      >
        <h3 className="text-white font-bold text-sm uppercase">
          {formMode === "edit" ? "Editar área" : "Nova área"}
        </h3>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs">Nome</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="bg-zinc-950 border-zinc-800 text-white h-11"
            placeholder="Ex.: Centro, Caji, Área de risco"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Status</Label>
            <select
              value={form.status}
              onChange={(e) => {
                const status = e.target.value === "blocked" ? "blocked" : "active";
                setForm((f) => ({
                  ...f,
                  status,
                  color: status === "blocked" ? "#ef4444" : f.color === "#ef4444" ? "#22c55e" : f.color,
                }));
              }}
              className="w-full h-11 rounded-md bg-zinc-950 border border-zinc-800 text-white text-sm px-3"
            >
              <option value="active">Ativa (entrega)</option>
              <option value="blocked">Bloqueada (não entrega)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Cor</Label>
            <Input
              type="color"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 h-11 p-1"
            />
          </div>
        </div>
        {form.status === "blocked" && (
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Motivo do bloqueio</Label>
            <Input
              value={form.blockReason}
              onChange={(e) => setForm((f) => ({ ...f, blockReason: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 text-white h-11"
              placeholder="Ex.: Área de risco — não entregamos"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Taxa mínima (R$)</Label>
            <Input
              value={form.minFee}
              onChange={(e) => setForm((f) => ({ ...f, minFee: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 text-white h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Valor por km (R$)</Label>
            <Input
              value={form.feePerKm}
              onChange={(e) => setForm((f) => ({ ...f, feePerKm: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 text-white h-11"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Distância máx. km (opc.)</Label>
            <Input
              value={form.maxDistanceKm}
              onChange={(e) => setForm((f) => ({ ...f, maxDistanceKm: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 text-white h-11"
              placeholder="Ex.: 8"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Prioridade</Label>
            <Input
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 text-white h-11"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-400 text-xs">Observações</Label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
          />
        </div>
        <Button
          type="button"
          disabled={saving || !form.name.trim()}
          onClick={() => void handleSave()}
          className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Check size={16} className="mr-1" />
          )}
          Salvar Área
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
          Áreas cadastradas ({areas.length})
        </h3>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-amber-500" />
          </div>
        ) : areas.length === 0 ? (
          <p className="text-zinc-600 text-sm py-4 text-center">Nenhuma área salva ainda.</p>
        ) : (
          areas.map((area) => (
            <div
              key={area.id}
              className={`rounded-xl border px-3 py-3 flex items-start gap-3 ${
                selectedId === area.id
                  ? "border-amber-500/50 bg-amber-500/5"
                  : "border-zinc-800 bg-zinc-900/80"
              }`}
            >
              <span
                className="mt-1 w-3 h-3 rounded-full shrink-0"
                style={{ background: area.color, opacity: area.enabled ? 1 : 0.35 }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-bold truncate">{area.name}</p>
                <p className="text-zinc-500 text-[11px]">
                  {area.status === "blocked" ? "Bloqueada" : "Ativa"}
                  {" · "}
                  {area.enabled ? "Ligada" : "Desligada"}
                  {area.status === "blocked" && area.blockReason ? ` · ${area.blockReason}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title={area.enabled ? "Desligar" : "Ligar"}
                  onClick={() => void handleQuickToggle(area)}
                  className={area.enabled ? "text-emerald-400 p-1.5" : "text-zinc-600 p-1.5"}
                >
                  {area.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
                <button
                  type="button"
                  className="text-zinc-400 p-1.5 hover:text-white"
                  onClick={() => {
                    clearDraftLayer();
                    setDraftPolygon(null);
                    setDrawing(false);
                    setSelectedId(area.id);
                    setEditingId(area.id);
                    setForm(formFromArea(area));
                    openForm("edit");
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="text-zinc-500 p-1.5 hover:text-red-400"
                  onClick={() => void handleDelete(area.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
