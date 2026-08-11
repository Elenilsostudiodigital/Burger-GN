import React, { useEffect, useRef, useState } from 'react';
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
  DeliveryStreetOrigin,
  KmDeliveryConfig,
} from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, ToggleLeft, ToggleRight, Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function fmtMoney(v: number) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
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

function mapEmbedUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.012}%2C${lat - 0.012}%2C${lng + 0.012}%2C${lat + 0.012}&layer=mapnik&marker=${lat}%2C${lng}`;
}

const ORIGIN_LABEL: Record<DeliveryStreetOrigin, string> = {
  manual: 'Manual',
  pedido: 'Aprovada por Pedido',
  importada: 'Importada',
};

type CreateForm = {
  streetName: string;
  neighborhood: string;
  city: string;
  cep: string;
  notes: string;
  maxDeliveryTime: string;
  fee: string;
  eta: string;
  active: boolean;
};

const EMPTY_CREATE: CreateForm = {
  streetName: '',
  neighborhood: '',
  city: 'Lauro de Freitas',
  cep: '',
  notes: '',
  maxDeliveryTime: '',
  fee: '',
  eta: '',
  active: true,
};

function normalizeTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export default function AdminRuasEntrega() {
  const [list, setList] = useState<DeliveryStreet[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [kmConfig, setKmConfig] = useState<KmDeliveryConfig | null>(null);

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createCoords, setCreateCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [createDistanceKm, setCreateDistanceKm] = useState<number | null>(null);
  const [suggestedFee, setSuggestedFee] = useState<number | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoMessage, setGeoMessage] = useState('');

  const [editing, setEditing] = useState<DeliveryStreet | null>(null);
  const [editNeighborhood, setEditNeighborhood] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editFee, setEditFee] = useState('');
  const [editEta, setEditEta] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editMaxDeliveryTime, setEditMaxDeliveryTime] = useState('');
  const [editActive, setEditActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const geoDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = async (query = q) => {
    setLoading(true);
    try {
      setList(await getAdminDeliveryStreets(query));
    } catch {
      setError('Não foi possível carregar as ruas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh('');
    getKmDeliveryConfig().then(setKmConfig).catch(() => setKmConfig(null));
  }, []);

  // Auto-geocode while typing — same Nominatim system as checkout (multi-field + CEP priority)
  useEffect(() => {
    if (!creating) return;
    const street = createForm.streetName.trim();
    const neighborhood = createForm.neighborhood.trim();
    const city = createForm.city.trim() || 'Lauro de Freitas';
    if (street.length < 3 || !neighborhood) {
      setCreateCoords(null);
      setCreateDistanceKm(null);
      setSuggestedFee(null);
      setGeoMessage('');
      return;
    }

    clearTimeout(geoDebounce.current);
    geoDebounce.current = setTimeout(async () => {
      setGeoLoading(true);
      setGeoMessage('');
      try {
        const located = await geocodeStreetLocation({
          street,
          neighborhood,
          city,
          cep: createForm.cep,
          state: 'Bahia',
        });
        if (!located) {
          setCreateCoords(null);
          setCreateDistanceKm(null);
          setSuggestedFee(null);
          setGeoMessage(
            'Não foi possível localizar exatamente este endereço.\n\nVerifique o nome da rua, bairro ou CEP.\nVocê ainda pode salvar o cadastro manualmente.',
          );
          return;
        }
        setCreateCoords({ lat: located.lat, lng: located.lng });

        const baseLat = parseFloat(String(kmConfig?.baseLat ?? '0'));
        const baseLng = parseFloat(String(kmConfig?.baseLng ?? '0'));
        if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng) || (baseLat === 0 && baseLng === 0)) {
          setCreateDistanceKm(null);
          setSuggestedFee(null);
          setGeoMessage('Local da loja não configurado para calcular distância. Você ainda pode salvar o cadastro.');
          return;
        }

        const haversine = haversineKm(baseLat, baseLng, located.lat, located.lng);
        const routeKm = parseFloat((haversine * 1.3).toFixed(2));
        const eta = estimateEtaMinutes(routeKm);
        const fee = suggestFee(routeKm, kmConfig?.tiers ?? []);
        setCreateDistanceKm(routeKm);
        setSuggestedFee(fee);
        setCreateForm((f) => ({
          ...f,
          fee: String(fee),
          eta: String(eta),
        }));
      } catch {
        setCreateCoords(null);
        setCreateDistanceKm(null);
        setSuggestedFee(null);
        setGeoMessage(
          'Não foi possível localizar exatamente este endereço.\n\nVerifique o nome da rua, bairro ou CEP.\nVocê ainda pode salvar o cadastro manualmente.',
        );
      } finally {
        setGeoLoading(false);
      }
    }, 900);

    return () => clearTimeout(geoDebounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    creating,
    createForm.streetName,
    createForm.neighborhood,
    createForm.city,
    createForm.cep,
    kmConfig,
  ]);

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setCreateForm(EMPTY_CREATE);
    setCreateCoords(null);
    setCreateDistanceKm(null);
    setSuggestedFee(null);
    setGeoMessage('');
    setError('');
  };

  const openEdit = (s: DeliveryStreet) => {
    setEditing(s);
    setCreating(false);
    setEditNeighborhood(s.neighborhood || '');
    setEditCity(s.city || '');
    setEditFee(String(s.fee));
    setEditEta(s.etaMinutes != null ? String(s.etaMinutes) : '');
    setEditNotes(s.notes || '');
    setEditMaxDeliveryTime(s.maxDeliveryTime || '');
    setEditActive(s.active);
    setError('');
  };

  const handleCreate = async () => {
    const streetName = createForm.streetName.trim();
    if (streetName.length < 3) {
      setError('Informe o nome da rua.');
      return;
    }
    if (!createForm.neighborhood.trim()) {
      setError('Informe o bairro.');
      return;
    }
    const feeRaw = createForm.fee.trim();
    const feeNum = feeRaw === '' ? 0 : parseFloat(feeRaw.replace(',', '.'));
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      setError('Informe uma taxa válida (pode editar a taxa sugerida).');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createAdminDeliveryStreet({
        streetName,
        neighborhood: createForm.neighborhood.trim(),
        city: createForm.city.trim() || 'Lauro de Freitas',
        cep: createForm.cep.replace(/\D/g, '').slice(0, 8),
        lat: createCoords?.lat ?? null,
        lng: createCoords?.lng ?? null,
        distanceKm: createDistanceKm,
        etaMinutes: createForm.eta ? Number(createForm.eta) : null,
        fee: feeNum,
        notes: createForm.notes.trim(),
        maxDeliveryTime: createForm.maxDeliveryTime.trim() || null,
        active: createForm.active,
        origin: 'manual',
      });
      setCreating(false);
      setCreateForm(EMPTY_CREATE);
      setCreateCoords(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar rua');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const feeNum = parseFloat(editFee.replace(',', '.'));
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      setError('Taxa inválida');
      return;
    }
    setSaving(true);
    setError('');
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
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: DeliveryStreet) => {
    try {
      await updateAdminDeliveryStreet(s.id, { active: !s.active });
      await refresh();
    } catch {
      setError('Não foi possível alterar o status');
    }
  };

  const handleDelete = async (s: DeliveryStreet) => {
    if (!confirm(`Excluir a rua "${s.streetName}"?`)) return;
    try {
      await deleteAdminDeliveryStreet(s.id);
      await refresh();
    } catch {
      setError('Não foi possível excluir');
    }
  };

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

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void refresh(q);
              }}
              placeholder="Buscar rua, bairro ou cidade"
              className="bg-zinc-950 border-zinc-800 h-11 pl-9 text-white"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void refresh(q)} className="h-11 rounded-xl px-4">
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

        {error ? <p className="text-red-400 text-sm">{error}</p> : null}

        {creating ? (
          <section className="rounded-2xl border border-amber-500/30 bg-zinc-900/80 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-white font-black text-sm uppercase tracking-tight">Cadastrar Nova Rua</h2>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="text-zinc-500 text-xs font-bold uppercase hover:text-white"
              >
                Fechar
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-500 text-xs">Rua</Label>
                  <Input
                    value={createForm.streetName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, streetName: e.target.value }))}
                    placeholder="Ex: Rua das Palmeiras"
                    className="bg-zinc-950 border-zinc-800 h-11 text-white"
                  />
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs">Bairro</Label>
                  <Input
                    value={createForm.neighborhood}
                    onChange={(e) => setCreateForm((f) => ({ ...f, neighborhood: e.target.value }))}
                    placeholder="Ex: Centro"
                    className="bg-zinc-950 border-zinc-800 h-11 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-500 text-xs">Cidade</Label>
                    <Input
                      value={createForm.city}
                      onChange={(e) => setCreateForm((f) => ({ ...f, city: e.target.value }))}
                      className="bg-zinc-950 border-zinc-800 h-11 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-500 text-xs">CEP (opcional)</Label>
                    <Input
                      value={createForm.cep}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          cep: e.target.value.replace(/\D/g, '').slice(0, 8),
                        }))
                      }
                      inputMode="numeric"
                      className="bg-zinc-950 border-zinc-800 h-11 text-white"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs">🕒 Horário máximo de entrega nesta rua</Label>
                  <Input
                    value={createForm.maxDeliveryTime}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, maxDeliveryTime: normalizeTimeInput(e.target.value) }))
                    }
                    placeholder="Ex: 21:00"
                    inputMode="numeric"
                    className="bg-zinc-950 border-zinc-800 h-11 text-white"
                  />
                  <p className="text-zinc-600 text-[11px] mt-1">
                    O cliente verá automaticamente o aviso de horário no checkout.
                  </p>
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs">Observações da Entrega</Label>
                  <textarea
                    value={createForm.notes}
                    onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={4}
                    placeholder={
                      'Ex.: Entregar apenas na portaria.\nCondomínio: autorizar a portaria.\nCliente retirar na guarita.'
                    }
                    className="w-full mt-1 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-600 resize-y min-h-[96px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-500 text-xs">
                      Taxa {suggestedFee != null ? `(sugerida ${fmtMoney(suggestedFee)})` : ''}
                    </Label>
                    <Input
                      value={createForm.fee}
                      onChange={(e) => setCreateForm((f) => ({ ...f, fee: e.target.value }))}
                      className="bg-zinc-950 border-zinc-800 h-11 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-500 text-xs">Tempo (min)</Label>
                    <Input
                      value={createForm.eta}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, eta: e.target.value.replace(/\D/g, '') }))
                      }
                      className="bg-zinc-950 border-zinc-800 h-11 text-white"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm.active}
                    onChange={(e) => setCreateForm((f) => ({ ...f, active: e.target.checked }))}
                    className="rounded border-zinc-700"
                  />
                  Rua ativa (aceitar pedidos)
                </label>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950 min-h-[220px] flex items-center justify-center">
                  {geoLoading ? (
                    <Loader2 className="animate-spin text-amber-500" />
                  ) : createCoords ? (
                    <iframe
                      title="Mapa da rua"
                      src={mapEmbedUrl(createCoords.lat, createCoords.lng)}
                      className="w-full h-[220px] border-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-center px-4 py-8 text-zinc-600 text-sm">
                      <MapPin className="mx-auto mb-2 opacity-50" size={28} />
                      Digite rua e bairro para localizar no mapa
                    </div>
                  )}
                </div>
                {createCoords ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-3 space-y-1.5 text-sm">
                    <p className="text-zinc-300">
                      📍 Localização:{' '}
                      <span className="text-white font-bold">
                        {createCoords.lat.toFixed(5)}, {createCoords.lng.toFixed(5)}
                      </span>
                    </p>
                    {createDistanceKm != null ? (
                      <p className="text-zinc-300">
                        📏 Distância até a hamburgueria:{' '}
                        <span className="text-white font-bold">{createDistanceKm.toFixed(1)} km</span>
                      </p>
                    ) : null}
                    {createForm.eta ? (
                      <p className="text-zinc-300">
                        🚗 Tempo estimado:{' '}
                        <span className="text-white font-bold">~{createForm.eta} min</span>
                      </p>
                    ) : null}
                    {suggestedFee != null ? (
                      <p className="text-zinc-300">
                        💰 Taxa sugerida:{' '}
                        <span className="text-amber-400 font-bold">{fmtMoney(suggestedFee)}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {geoMessage ? (
                  <p className="text-orange-400 text-xs whitespace-pre-line leading-relaxed">{geoMessage}</p>
                ) : null}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                disabled={saving}
                onClick={() => void handleCreate()}
                className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar Rua'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreating(false)}
                className="h-11 rounded-xl border-zinc-700"
              >
                Cancelar
              </Button>
            </div>
          </section>
        ) : null}

        {editing ? (
          <section className="rounded-2xl border border-amber-500/30 bg-zinc-900/80 p-4 space-y-3">
            <h2 className="text-white font-black text-sm">{editing.streetName}</h2>
            <p className="text-zinc-500 text-xs">
              Origem: {ORIGIN_LABEL[editing.origin] || editing.origin}
              {editing.cep ? ` · CEP ${editing.cep}` : ''}
            </p>
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
              <Label className="text-zinc-500 text-xs">🕒 Horário máximo de entrega nesta rua</Label>
              <Input
                value={editMaxDeliveryTime}
                onChange={(e) => setEditMaxDeliveryTime(normalizeTimeInput(e.target.value))}
                placeholder="Ex: 21:00"
                inputMode="numeric"
                className="bg-zinc-950 border-zinc-800 h-11 text-white"
              />
            </div>
            <div>
              <Label className="text-zinc-500 text-xs">Observações da Entrega</Label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={4}
                className="w-full mt-1 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white resize-y min-h-[96px]"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="rounded border-zinc-700"
              />
              {editActive ? '🟢 Ativa' : '🔴 Desativada'}
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveEdit()}
                className="flex-1 h-11 rounded-xl"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar'}
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
        ) : null}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-amber-500" />
          </div>
        ) : list.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-10">Nenhuma rua cadastrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {list.map((s) => (
              <div
                key={s.id}
                className={`rounded-2xl border p-4 ${
                  s.active ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-800/50 bg-zinc-950 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-bold text-sm truncate">{s.streetName}</p>
                      <span className={`text-[10px] font-bold ${s.active ? 'text-green-400' : 'text-red-400'}`}>
                        {s.active ? '🟢 Ativa' : '🔴 Desativada'}
                      </span>
                    </div>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {s.neighborhood || '—'} · {s.city}
                      {s.distanceKm != null ? ` · ${s.distanceKm.toFixed(1)} km` : ''}
                      {s.etaMinutes != null ? ` · ${s.etaMinutes} min` : ''}
                    </p>
                    <p className="text-zinc-600 text-[10px] uppercase tracking-wide mt-1 font-bold">
                      Origem: {ORIGIN_LABEL[s.origin] || s.origin || 'Manual'}
                      {s.maxDeliveryTime ? ` · Entrega até ${s.maxDeliveryTime}` : ''}
                    </p>
                    {s.notes ? (
                      <p className="text-zinc-400 text-xs mt-1.5 line-clamp-2 whitespace-pre-line">{s.notes}</p>
                    ) : null}
                    <p className="text-amber-400 text-sm font-black mt-1">{fmtMoney(s.fee)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void toggleActive(s)}
                      className="p-2 text-zinc-400 hover:text-amber-400"
                      aria-label="Ativar/Desativar"
                    >
                      {s.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
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
        )}
      </main>

      <AdminBottomNav active="/admin/ruas-entrega" />
    </div>
  );
}
