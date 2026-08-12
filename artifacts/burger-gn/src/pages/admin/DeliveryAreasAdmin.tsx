/**
 * Áreas de Entrega — admin map panel (Leaflet + Geoman).
 * Mounted only while the "Áreas" tab is active; map is destroyed on unmount.
 */
import React, { useEffect, useRef, useState } from "react";
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

function polygonFromLayer(layer: L.Layer): DeliveryAreaPolygon | null {
  const anyLayer = layer as L.Layer & { toGeoJSON?: () => { geometry?: DeliveryAreaPolygon } | DeliveryAreaPolygon };
  const gj = anyLayer.toGeoJSON?.();
  const geom = (gj && "geometry" in (gj as object) ? (gj as { geometry?: DeliveryAreaPolygon }).geometry : gj) as
    | DeliveryAreaPolygon
    | undefined;
  if (!geom) return null;
  if (geom.type === "Polygon" || geom.type === "MultiPolygon") return geom;
  return null;
}

export default function DeliveryAreasAdmin() {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerById = useRef<Map<number, L.Polygon>>(new Map());
  const draftLayerRef = useRef<L.Layer | null>(null);

  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [areasEnabled, setAreasEnabled] = useState(false);
  const [baseLat, setBaseLat] = useState(DEFAULT_CENTER[0]);
  const [baseLng, setBaseLng] = useState(DEFAULT_CENTER[1]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draftPolygon, setDraftPolygon] = useState<DeliveryAreaPolygon | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [list, settings] = await Promise.all([
        listAdminDeliveryAreas(),
        getAdminDeliveryAreasSettings(),
      ]);
      setAreas(Array.isArray(list) ? list : []);
      setAreasEnabled(Boolean(settings.areasEnabled));
      if (Number.isFinite(settings.baseLat) && Number.isFinite(settings.baseLng) && !(settings.baseLat === 0 && settings.baseLng === 0)) {
        setBaseLat(settings.baseLat);
        setBaseLng(settings.baseLng);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar áreas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Init map once host is mounted
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
      removalMode: true,
      rotateMode: false,
    });

    map.on("pm:create", ((e: unknown) => {
      const ev = e as { layer: L.Layer };
      if (draftLayerRef.current) {
        map.removeLayer(draftLayerRef.current);
      }
      draftLayerRef.current = ev.layer;
      const poly = polygonFromLayer(ev.layer);
      setDraftPolygon(poly);
      setDrawing(false);
      setEditingId(null);
      setForm(emptyForm("active"));
      setSelectedId(null);
    }) as L.LeafletEventHandlerFn);

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 80);

    return () => {
      map.remove();
      mapRef.current = null;
      layerById.current.clear();
      draftLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter when base coords load
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([baseLat, baseLng], map.getZoom() || 13);
  }, [baseLat, baseLng]);

  // Sync area layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const keep = new Set(areas.map((a) => a.id));
    for (const [id, layer] of layerById.current.entries()) {
      if (!keep.has(id)) {
        map.removeLayer(layer);
        layerById.current.delete(id);
      }
    }

    for (const area of areas) {
      const existing = layerById.current.get(area.id);
      if (existing) {
        map.removeLayer(existing);
        layerById.current.delete(area.id);
      }
      try {
        const layer = L.geoJSON(area.polygon as GeoJSON.GeoJsonObject, {
          style: {
            color: area.color || "#22c55e",
            weight: selectedId === area.id ? 3 : 2,
            fillColor: area.color || "#22c55e",
            fillOpacity: area.enabled ? (area.status === "blocked" ? 0.35 : 0.25) : 0.08,
            opacity: area.enabled ? 1 : 0.35,
            dashArray: area.enabled ? undefined : "4 6",
          },
        });
        layer.eachLayer((l) => {
          const poly = l as L.Polygon;
          poly.on("click", () => {
            setSelectedId(area.id);
            setEditingId(area.id);
            setDraftPolygon(null);
            setForm({
              name: area.name,
              color: area.color,
              status: area.status === "blocked" ? "blocked" : "active",
              blockReason: area.blockReason || "",
              minFee: String(area.minFee ?? "0"),
              feePerKm: String(area.feePerKm ?? "0"),
              maxDistanceKm: area.maxDistanceKm != null ? String(area.maxDistanceKm) : "",
              notes: area.notes || "",
              priority: String(area.priority ?? 0),
            });
          });
          layerById.current.set(area.id, poly);
        });
        layer.addTo(map);
      } catch {
        /* skip bad polygon */
      }
    }
  }, [areas, selectedId]);

  const startDraw = () => {
    const map = mapRef.current;
    if (!map) return;
    setDrawing(true);
    setEditingId(null);
    setSelectedId(null);
    setDraftPolygon(null);
    setForm(emptyForm("active"));
    map.pm.enableDraw("Polygon", { snappable: true, allowSelfIntersection: false });
  };

  const cancelDraft = () => {
    const map = mapRef.current;
    if (draftLayerRef.current && map) {
      map.removeLayer(draftLayerRef.current);
      draftLayerRef.current = null;
    }
    map?.pm.disableDraw();
    setDraftPolygon(null);
    setDrawing(false);
    setForm(emptyForm());
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ligar/desligar");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      if (form.status === "blocked" && !form.blockReason.trim()) {
        setError("Informe o motivo do bloqueio.");
        setSaving(false);
        return;
      }

      if (editingId != null) {
        // Capture edited geometry if layer was modified
        let polygon: DeliveryAreaPolygon | undefined;
        const layer = layerById.current.get(editingId);
        if (layer) {
          const p = polygonFromLayer(layer);
          if (p) polygon = p;
        }
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
          ...(polygon ? { polygon } : {}),
        });
        setAreas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setEditingId(updated.id);
        setSelectedId(updated.id);
      } else {
        if (!draftPolygon) {
          setError("Desenhe a área no mapa antes de salvar.");
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
          polygon: draftPolygon,
          enabled: true,
          city: "Lauro de Freitas",
        } as Parameters<typeof createAdminDeliveryArea>[0]);
        setAreas((prev) => [created, ...prev]);
        if (draftLayerRef.current && mapRef.current) {
          mapRef.current.removeLayer(draftLayerRef.current);
          draftLayerRef.current = null;
        }
        setDraftPolygon(null);
        setEditingId(created.id);
        setSelectedId(created.id);
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
      setAreas((prev) => prev.filter((a) => a.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setSelectedId(null);
        setForm(emptyForm());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const showForm = Boolean(draftPolygon) || editingId != null;

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

      <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950">
        <div ref={mapHostRef} className="w-full h-[320px] sm:h-[420px] z-0" />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={startDraw}
          disabled={drawing}
          className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
        >
          <Plus size={16} className="mr-1" /> Desenhar área
        </Button>
        {(drawing || draftPolygon) && (
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

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {showForm && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h3 className="text-white font-bold text-sm uppercase">
            {editingId != null ? "Editar área" : "Nova área"}
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
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} className="mr-1" />}
            Salvar área
          </Button>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
          Áreas cadastradas ({areas.length})
        </h3>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-amber-500" />
          </div>
        ) : areas.length === 0 ? (
          <p className="text-zinc-600 text-sm py-4 text-center">Nenhuma área desenhada ainda.</p>
        ) : (
          areas.map((area) => (
            <div
              key={area.id}
              className={`rounded-xl border px-3 py-3 flex items-start gap-3 ${
                selectedId === area.id ? "border-amber-500/50 bg-amber-500/5" : "border-zinc-800 bg-zinc-900/80"
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
                  {area.status === "blocked" && area.blockReason
                    ? ` · ${area.blockReason}`
                    : ""}
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
                    setSelectedId(area.id);
                    setEditingId(area.id);
                    setDraftPolygon(null);
                    setForm({
                      name: area.name,
                      color: area.color,
                      status: area.status === "blocked" ? "blocked" : "active",
                      blockReason: area.blockReason || "",
                      minFee: String(area.minFee ?? "0"),
                      feePerKm: String(area.feePerKm ?? "0"),
                      maxDistanceKm: area.maxDistanceKm != null ? String(area.maxDistanceKm) : "",
                      notes: area.notes || "",
                      priority: String(area.priority ?? 0),
                    });
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
