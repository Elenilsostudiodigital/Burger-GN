/**
 * Ruas de Entrega — stable React DOM tree (no insertBefore).
 *
 * Root cause of NotFoundError (insertBefore):
 * siblings under <main> were conditionally mounted/unmounted (pageError,
 * edit form, listLoading spinner ↔ empty ↔ list, candidates empty ↔ results)
 * while the create form (with StreetMapPreview) stayed mounted nearby.
 * React then called insertBefore against a reference node that was no longer
 * a child of that parent.
 *
 * Contract:
 * - no iframe (static map <img> via StreetMapPreview)
 * - every <main> panel stays mounted; show/hide only via CSS `hidden`
 * - results/list empty states never swap element types via ternary null
 * - Localizar Endereço never remounts the map host
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  getAdminDeliveryStreets,
  createAdminDeliveryStreet,
  updateAdminDeliveryStreet,
  deleteAdminDeliveryStreet,
  getKmDeliveryConfig,
  geocodeStreetLocation,
  haversineKm,
  findKmTier,
  DeliveryStreet,
  KmDeliveryConfig,
  GeocodeStreetCandidate,
} from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { StreetMapPreview } from '../../components/StreetMapPreview';
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, ToggleLeft, ToggleRight, Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function fmtMoney(v: number) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
}

function estimateEtaMinutes(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 10;
  return Math.max(8, Math.round((distanceKm / 22) * 60) + 5);
}

function suggestFee(distanceKm: number, tiers: KmDeliveryConfig['tiers']): number {
  const { fee, consult } = findKmTier(distanceKm, tiers);
  if (!consult && fee != null && Number.isFinite(fee)) return fee;
  if (distanceKm <= 2) return 5;
  if (distanceKm <= 4) return 7;
  if (distanceKm <= 6) return 9;
  if (distanceKm <= 8) return 12;
  if (distanceKm <= 12) return 15;
  return 18;
}

function normalizeTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

type FormState = {
  streetName: string;
  neighborhood: string;
  city: string;
  cep: string;
  notes: string;
  maxDeliveryTime: string;
  fee: string;
  eta: string;
};

const EMPTY_FORM: FormState = {
  streetName: '',
  neighborhood: '',
  city: 'Lauro de Freitas',
  cep: '',
  notes: '',
  maxDeliveryTime: '',
  fee: '',
  eta: '',
};

export default function AdminRuasEntrega() {
  const [list, setList] = useState<DeliveryStreet[]>([]);
  const [q, setQ] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [kmConfig, setKmConfig] = useState<KmDeliveryConfig | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [suggestedFee, setSuggestedFee] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<GeocodeStreetCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<DeliveryStreet | null>(null);
  const [editNeighborhood, setEditNeighborhood] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editFee, setEditFee] = useState('');
  const [editEta, setEditEta] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editMaxDeliveryTime, setEditMaxDeliveryTime] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [pageError, setPageError] = useState('');

  const refreshList = async (query = q) => {
    setListLoading(true);
    try {
      setList(await getAdminDeliveryStreets(query));
      setPageError('');
    } catch {
      setPageError('Não foi possível carregar as ruas.');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    void refreshList('');
    getKmDeliveryConfig()
      .then(setKmConfig)
      .catch(() => setKmConfig(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setCoords(null);
    setDistanceKm(null);
    setSuggestedFee(null);
    setCandidates([]);
    setSelectedId(null);
    setGeoLoading(false);
    setGeoStatus('');
    setFormError('');
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setShowForm(true);
  };

  const closeCreate = () => {
    setShowForm(false);
    resetForm();
  };

  const patchForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const applyCandidate = (candidate: GeocodeStreetCandidate) => {
    const lat = toFiniteNumber(candidate.lat);
    const lng = toFiniteNumber(candidate.lng);
    if (lat == null || lng == null) {
      setFormError('Resultado sem coordenadas válidas. Escolha outro da lista.');
      setGeoStatus('Resultado sem coordenadas válidas.');
      return;
    }

    setSelectedId(String(candidate.id));
    setCoords({ lat, lng });
    setFormError('');
    setGeoStatus('Endereço selecionado. Revise a taxa e salve.');

    const baseLat = parseFloat(String(kmConfig?.baseLat ?? '0'));
    const baseLng = parseFloat(String(kmConfig?.baseLng ?? '0'));
    if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng) || (baseLat === 0 && baseLng === 0)) {
      setDistanceKm(null);
      setSuggestedFee(null);
      setGeoStatus('Local da loja não configurado para calcular distância. Você ainda pode salvar.');
      return;
    }

    const routeKm = parseFloat((haversineKm(baseLat, baseLng, lat, lng) * 1.3).toFixed(2));
    const eta = estimateEtaMinutes(routeKm);
    const fee = suggestFee(routeKm, kmConfig?.tiers ?? []);
    setDistanceKm(routeKm);
    setSuggestedFee(fee);
    patchForm({ fee: String(fee), eta: String(eta) });
  };

  const handleLocate = async () => {
    const street = form.streetName.trim();
    const neighborhood = form.neighborhood.trim();
    const city = form.city.trim() || 'Lauro de Freitas';

    if (street.length < 3) {
      setFormError('Informe o nome da rua (mín. 3 caracteres).');
      return;
    }
    if (!neighborhood) {
      setFormError('Informe o bairro.');
      return;
    }

    setFormError('');
    setGeoLoading(true);
    setGeoStatus('Buscando endereços…');
    setCandidates([]);
    setSelectedId(null);
    // Keep previous coords/map image until the admin picks a new result.

    try {
      const result = await geocodeStreetLocation({
        street,
        neighborhood,
        city,
        cep: form.cep,
        state: 'Bahia',
      });
      if (!result.candidates.length) {
        const msg =
          result.message ||
          'Nenhum endereço encontrado. Verifique rua, bairro e cidade.';
        setGeoStatus(msg);
        setFormError(msg);
        return;
      }
      setCandidates(result.candidates);
      setGeoStatus(`Encontrados ${result.candidates.length} resultado(s). Selecione o correto.`);
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível localizar o endereço. Tente novamente.';
      setCandidates([]);
      setGeoStatus(msg);
      setFormError(msg);
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSave = async () => {
    const streetName = form.streetName.trim();
    if (streetName.length < 3) {
      setFormError('Informe o nome da rua.');
      return;
    }
    if (!form.neighborhood.trim()) {
      setFormError('Informe o bairro.');
      return;
    }
    const feeNum =
      form.fee.trim() === '' ? 0 : parseFloat(form.fee.trim().replace(',', '.'));
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      setFormError('Informe uma taxa válida.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      await createAdminDeliveryStreet({
        streetName,
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim() || 'Lauro de Freitas',
        cep: form.cep.replace(/\D/g, '').slice(0, 8),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        distanceKm,
        etaMinutes: form.eta ? Number(form.eta) : null,
        fee: feeNum,
        notes: form.notes.trim(),
        maxDeliveryTime: form.maxDeliveryTime.trim() || null,
        active: true,
        origin: 'manual',
      });
      closeCreate();
      await refreshList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar rua');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (s: DeliveryStreet) => {
    setShowForm(false);
    resetForm();
    setEditing(s);
    setEditNeighborhood(s.neighborhood || '');
    setEditCity(s.city || '');
    setEditFee(String(s.fee));
    setEditEta(s.etaMinutes != null ? String(s.etaMinutes) : '');
    setEditNotes(s.notes || '');
    setEditMaxDeliveryTime(s.maxDeliveryTime || '');
    setEditActive(s.active);
    setPageError('');
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const feeNum = parseFloat(editFee.replace(',', '.'));
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      setPageError('Taxa inválida');
      return;
    }
    setSaving(true);
    setPageError('');
    try {
      await updateAdminDeliveryStreet(editing.id, {
        neighborhood: editNeighborhood.trim(),
        city: editCity.trim() || 'Lauro de Freitas',
        fee: feeNum,
        etaMinutes: editEta ? Number(editEta) : null,
        notes: editNotes,
        maxDeliveryTime: editMaxDeliveryTime.trim() || null,
        active: editActive,
      });
      setEditing(null);
      await refreshList();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: DeliveryStreet) => {
    try {
      await updateAdminDeliveryStreet(s.id, { active: !s.active });
      await refreshList();
    } catch {
      setPageError('Não foi possível alterar o status');
    }
  };

  const handleDelete = async (s: DeliveryStreet) => {
    if (!confirm(`Excluir a rua "${s.streetName}"?`)) return;
    try {
      await deleteAdminDeliveryStreet(s.id);
      await refreshList();
    } catch {
      setPageError('Não foi possível excluir');
    }
  };

  const showPageError = Boolean(pageError) && !showForm;
  const showEmptyList = !listLoading && list.length === 0;
  const showList = !listLoading && list.length > 0;
  const hasCandidates = candidates.length > 0;
  const feeLabel =
    suggestedFee != null ? `Taxa (sugerida ${fmtMoney(suggestedFee)})` : 'Taxa';
  const resultsTitle = geoLoading
    ? 'Buscando…'
    : hasCandidates
      ? `Resultados (${candidates.length})`
      : 'Resultados';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      <header className="sticky top-0 z-30 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3 backdrop-blur">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/admin/config" className="p-2 text-zinc-400 hover:text-white">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-amber-500 text-[10px] font-bold uppercase tracking-widest">Configurações</p>
            <h1 className="font-black text-sm uppercase tracking-tight">Ruas de Entrega</h1>
          </div>
          <Link href="/admin/novas-ruas" className="ml-auto text-amber-500 text-[10px] font-bold uppercase">
            Novas Ruas
          </Link>
        </div>
      </header>

      {/*
        Fixed sibling tree under <main>: never mount/unmount panels.
        Visibility is CSS-only (`hidden`) so React never insertBefore across
        a reference node that disappeared during listLoading / edit toggles.
      */}
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void refreshList(q);
              }}
              placeholder="Buscar rua, bairro ou cidade"
              className="bg-zinc-950 border-zinc-800 h-11 pl-9 text-white"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void refreshList(q)} className="h-11 rounded-xl px-4">
              Buscar
            </Button>
            <Button
              type="button"
              onClick={openCreate}
              className="h-11 rounded-xl px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
            >
              <Plus size={16} className="mr-1" /> Cadastrar Nova Rua
            </Button>
          </div>
        </div>

        <p
          className={`text-red-400 text-sm min-h-[1.25rem] ${showPageError ? '' : 'invisible'}`}
          role={showPageError ? 'alert' : undefined}
        >
          {pageError || '\u00a0'}
        </p>

        <section
          className={`rounded-2xl border border-amber-500/30 bg-zinc-900/80 p-4 space-y-4 ${
            showForm ? '' : 'hidden'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-white font-black text-sm uppercase tracking-tight">Cadastrar Nova Rua</h2>
            <button
              type="button"
              onClick={closeCreate}
              className="text-zinc-500 text-xs font-bold uppercase hover:text-white"
            >
              Fechar
            </button>
          </div>

          <p className={`text-red-400 text-sm min-h-[1.25rem] ${formError ? '' : 'invisible'}`}>
            {formError || '\u00a0'}
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <Label className="text-zinc-500 text-xs">Rua</Label>
                <Input
                  value={form.streetName}
                  onChange={(e) => patchForm({ streetName: e.target.value })}
                  placeholder="Ex: Rua São Mateus"
                  className="bg-zinc-950 border-zinc-800 h-11 text-white"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label className="text-zinc-500 text-xs">Bairro</Label>
                <Input
                  value={form.neighborhood}
                  onChange={(e) => patchForm({ neighborhood: e.target.value })}
                  placeholder="Ex: Itinga"
                  className="bg-zinc-950 border-zinc-800 h-11 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-500 text-xs">Cidade</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => patchForm({ city: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 h-11 text-white"
                  />
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs">CEP</Label>
                  <Input
                    value={form.cep}
                    onChange={(e) =>
                      patchForm({ cep: e.target.value.replace(/\D/g, '').slice(0, 8) })
                    }
                    inputMode="numeric"
                    className="bg-zinc-950 border-zinc-800 h-11 text-white"
                  />
                </div>
              </div>

              <Button
                type="button"
                disabled={geoLoading}
                onClick={() => void handleLocate()}
                className="w-full h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold border border-zinc-700"
              >
                <span className={`inline-flex items-center ${geoLoading ? '' : 'hidden'}`}>
                  <Loader2 className="animate-spin mr-2" size={16} /> Localizando…
                </span>
                <span className={`inline-flex items-center ${geoLoading ? 'hidden' : ''}`}>
                  <MapPin className="mr-2" size={16} /> Localizar Endereço
                </span>
              </Button>

              <div>
                <Label className="text-zinc-500 text-xs">Horário máximo de entrega nesta rua</Label>
                <Input
                  value={form.maxDeliveryTime}
                  onChange={(e) => patchForm({ maxDeliveryTime: normalizeTimeInput(e.target.value) })}
                  placeholder="Ex: 21:00"
                  inputMode="numeric"
                  className="bg-zinc-950 border-zinc-800 h-11 text-white"
                />
              </div>

              <div>
                <Label className="text-zinc-500 text-xs">Observações</Label>
                <textarea
                  value={form.notes}
                  onChange={(e) => patchForm({ notes: e.target.value })}
                  rows={3}
                  placeholder="Ex.: Entregar apenas na portaria."
                  className="w-full mt-1 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-600 resize-y min-h-[84px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-500 text-xs">{feeLabel}</Label>
                  <Input
                    value={form.fee}
                    onChange={(e) => patchForm({ fee: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 h-11 text-white"
                  />
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs">Tempo (min)</Label>
                  <Input
                    value={form.eta}
                    onChange={(e) => patchForm({ eta: e.target.value.replace(/\D/g, '') })}
                    className="bg-zinc-950 border-zinc-800 h-11 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <StreetMapPreview
                lat={coords?.lat ?? null}
                lng={coords?.lng ?? null}
                loading={geoLoading}
                message={geoStatus}
              />

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 min-h-[8rem]">
                <p className="text-amber-300 text-xs font-bold mb-2">{resultsTitle}</p>
                <p
                  className={`text-zinc-600 text-xs ${hasCandidates ? 'hidden' : ''}`}
                >
                  {geoStatus || 'Nenhum resultado ainda.'}
                </p>
                <div
                  className={`space-y-1.5 max-h-56 overflow-y-auto ${hasCandidates ? '' : 'hidden'}`}
                >
                  {candidates.map((c) => {
                    const active = selectedId === String(c.id);
                    const label = [c.streetName, c.neighborhood || c.city].filter(Boolean).join(' — ');
                    return (
                      <button
                        key={String(c.id)}
                        type="button"
                        onClick={() => applyCandidate(c)}
                        className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                          active
                            ? 'border-amber-500 bg-amber-500/10'
                            : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600'
                        }`}
                      >
                        <p className="text-white text-sm font-bold">{label}</p>
                        <p className="text-zinc-500 text-[11px] mt-0.5 truncate">
                          {String(c.displayName ?? '')}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-sm text-zinc-400 min-h-[4.5rem]">
                <p className={distanceKm != null ? '' : 'hidden'}>
                  Distância estimada:{' '}
                  <span className="text-white font-bold">
                    {distanceKm != null ? `${distanceKm.toFixed(1)} km` : ''}
                  </span>
                </p>
                <p className={distanceKm != null ? 'hidden' : ''}>Distância: —</p>
                <p className={`mt-1 ${suggestedFee != null ? '' : 'hidden'}`}>
                  Taxa sugerida:{' '}
                  <span className="text-amber-400 font-bold">
                    {suggestedFee != null ? fmtMoney(suggestedFee) : ''}
                  </span>
                </p>
                <p className={`mt-1 ${suggestedFee != null ? 'hidden' : ''}`}>Taxa sugerida: —</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              disabled={saving || geoLoading}
              onClick={() => void handleSave()}
              className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
            >
              <span className={saving ? '' : 'hidden'}>
                <Loader2 className="animate-spin" size={16} />
              </span>
              <span className={saving ? 'hidden' : ''}>Salvar Rua</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={closeCreate}
              className="h-11 rounded-xl border-zinc-700"
            >
              Cancelar
            </Button>
          </div>
        </section>

        <section
          className={`rounded-2xl border border-amber-500/30 bg-zinc-900/80 p-4 space-y-3 ${
            editing ? '' : 'hidden'
          }`}
        >
          <h2 className="text-white font-black text-sm">{editing?.streetName || 'Editar rua'}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-500 text-xs">Bairro</Label>
              <Input
                value={editNeighborhood}
                onChange={(e) => setEditNeighborhood(e.target.value)}
                className="bg-zinc-950 border-zinc-800 h-11 text-white"
              />
            </div>
            <div>
              <Label className="text-zinc-500 text-xs">Cidade</Label>
              <Input
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                className="bg-zinc-950 border-zinc-800 h-11 text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-500 text-xs">Taxa</Label>
              <Input
                value={editFee}
                onChange={(e) => setEditFee(e.target.value)}
                className="bg-zinc-950 border-zinc-800 h-11 text-white"
              />
            </div>
            <div>
              <Label className="text-zinc-500 text-xs">Tempo (min)</Label>
              <Input
                value={editEta}
                onChange={(e) => setEditEta(e.target.value.replace(/\D/g, ''))}
                className="bg-zinc-950 border-zinc-800 h-11 text-white"
              />
            </div>
          </div>
          <div>
            <Label className="text-zinc-500 text-xs">Horário máximo de entrega</Label>
            <Input
              value={editMaxDeliveryTime}
              onChange={(e) => setEditMaxDeliveryTime(normalizeTimeInput(e.target.value))}
              placeholder="Ex: 21:00"
              className="bg-zinc-950 border-zinc-800 h-11 text-white"
            />
          </div>
          <div>
            <Label className="text-zinc-500 text-xs">Observações</Label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={3}
              className="w-full mt-1 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white resize-y"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={editActive}
              onChange={(e) => setEditActive(e.target.checked)}
              className="rounded border-zinc-700"
            />
            Rua ativa
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveEdit()}
              className="flex-1 h-11 rounded-xl"
            >
              <span className={saving ? '' : 'hidden'}>
                <Loader2 className="animate-spin" size={16} />
              </span>
              <span className={saving ? 'hidden' : ''}>Salvar</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
              className="h-11 rounded-xl border-zinc-700"
            >
              Cancelar
            </Button>
          </div>
        </section>

        <section className="min-h-[8rem]">
          <div className={`flex justify-center py-16 ${listLoading ? '' : 'hidden'}`}>
            <Loader2 className="animate-spin text-amber-500" />
          </div>
          <p
            className={`text-zinc-500 text-sm text-center py-10 ${showEmptyList ? '' : 'hidden'}`}
          >
            Nenhuma rua cadastrada ainda.
          </p>
          <div className={`space-y-2 ${showList ? '' : 'hidden'}`}>
            {list.map((s) => (
              <div
                key={s.id}
                className={`rounded-2xl border p-4 ${
                  s.active ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-800/50 bg-zinc-950 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm truncate">{s.streetName}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {s.neighborhood || '—'} · {s.city}
                      {s.distanceKm != null ? ` · ${s.distanceKm.toFixed(1)} km` : ''}
                      {s.etaMinutes != null ? ` · ${s.etaMinutes} min` : ''}
                    </p>
                    <p className="text-amber-400 text-sm font-black mt-1">{fmtMoney(s.fee)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void toggleActive(s)}
                      className="p-2 text-zinc-400 hover:text-amber-400"
                      aria-label="Ativar/Desativar"
                    >
                      <ToggleRight size={20} className={s.active ? '' : 'hidden'} />
                      <ToggleLeft size={20} className={s.active ? 'hidden' : ''} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="p-2 text-zinc-400 hover:text-white"
                      aria-label="Editar"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(s)}
                      className="p-2 text-zinc-400 hover:text-red-400"
                      aria-label="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <AdminBottomNav active="/admin/ruas-entrega" />
    </div>
  );
}
