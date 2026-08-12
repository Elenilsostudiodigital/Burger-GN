import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  getAdminAreaRequests,
  approveAreaRequest,
  rejectAreaRequest,
  DeliveryAreaRequest,
  AreaCoverageType,
} from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { StreetMapPreview } from '../../components/StreetMapPreview';
import { ArrowLeft, Loader2, MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function fmtDistance(v: number | null | undefined) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `${Number(v).toFixed(1)} km`;
}

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const COVERAGE_OPTIONS: { value: AreaCoverageType; label: string }[] = [
  { value: 'rua', label: 'Rua' },
  { value: 'bairro', label: 'Bairro' },
  { value: 'regiao', label: 'Região' },
];

export default function AdminAreaRequests() {
  const [, setLocation] = useLocation();
  const [list, setList] = useState<DeliveryAreaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DeliveryAreaRequest | null>(null);
  const [coverageType, setCoverageType] = useState<AreaCoverageType>('regiao');
  const [minFee, setMinFee] = useState('8.00');
  const [feePerKm, setFeePerKm] = useState('');
  const [color, setColor] = useState('#22c55e');
  const [risk, setRisk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setList(await getAdminAreaRequests('pending'));
    } catch {
      setError('Não foi possível carregar as solicitações.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/orders/stream', { withCredentials: true });
    es.addEventListener('area_request', () => {
      void refresh(true);
    });
    return () => es.close();
  }, []);

  const openApprove = (row: DeliveryAreaRequest) => {
    setSelected(row);
    setCoverageType('regiao');
    setMinFee('8.00');
    setFeePerKm('');
    setColor('#22c55e');
    setRisk(false);
    setError('');
  };

  const handleApprove = async () => {
    if (!selected) return;
    const fee = parseFloat(minFee.replace(',', '.'));
    if (!Number.isFinite(fee) || fee < 0) {
      setError('Informe uma taxa de entrega válida.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await approveAreaRequest(selected.id, {
        type: coverageType,
        minFee: fee,
        feePerKm: feePerKm ? parseFloat(feePerKm.replace(',', '.')) : 0,
        color,
        risk,
      });
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar a área.');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (id: number) => {
    setSaving(true);
    setError('');
    try {
      await rejectAreaRequest(id);
      if (selected?.id === id) setSelected(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao recusar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      <header className="sticky top-0 z-30 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3 backdrop-blur">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button type="button" onClick={() => setLocation('/admin/pedidos')} className="p-2 text-zinc-400 hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-amber-500 text-[10px] font-bold uppercase tracking-widest">Pedidos</p>
            <h1 className="font-black text-sm uppercase tracking-tight">Solicitações de Áreas</h1>
          </div>
          <Link href="/admin/entrega-km" className="ml-auto text-amber-500 text-[10px] font-bold uppercase">
            Áreas de entrega
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {error ? <p className="text-red-400 text-sm">{error}</p> : null}

        {!selected ? (
          loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber-500" /></div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-zinc-500 text-sm">
              Nenhuma solicitação de área aguardando análise.
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((r) => (
                <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-3">
                  <div className="min-w-0">
                    <p className="text-white font-black text-sm truncate">{r.customerName || '—'}</p>
                    <p className="text-zinc-400 text-xs mt-1 flex items-center gap-1.5">
                      <Phone size={12} /> {r.phone || '—'}
                    </p>
                    <p className="text-zinc-300 text-xs mt-2 leading-relaxed">{r.fullAddress || r.address || '—'}</p>
                    <p className="text-zinc-500 text-xs mt-1">
                      Bairro: {r.neighborhood || '—'} · Distância: {fmtDistance(r.distanceKm)}
                    </p>
                    <p className="text-zinc-600 text-[10px] mt-1">{fmtWhen(r.createdAt)}</p>
                  </div>
                  <StreetMapPreview
                    lat={r.lat != null && Number.isFinite(Number(r.lat)) ? Number(r.lat) : null}
                    lng={r.lng != null && Number.isFinite(Number(r.lng)) ? Number(r.lng) : null}
                    message="Sem coordenadas para exibir o mapa."
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() => openApprove(r)}
                      className="h-11 rounded-xl font-black text-xs uppercase"
                    >
                      <span>🟢 Aprovar Área</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void handleReject(r.id)}
                      className="h-11 rounded-xl font-black text-xs uppercase border-red-800 text-red-400 hover:bg-red-950/40"
                    >
                      <span>🔴 Recusar</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-zinc-500 text-xs font-bold uppercase hover:text-amber-400"
            >
              ← Voltar à lista
            </button>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-2">
              <h2 className="text-amber-500 text-xs font-bold uppercase tracking-wider">Cliente</h2>
              <p className="text-sm"><span className="text-zinc-500">Nome:</span> {selected.customerName || '—'}</p>
              <p className="text-sm"><span className="text-zinc-500">Telefone:</span> {selected.phone || '—'}</p>
              <p className="text-sm"><span className="text-zinc-500">Endereço:</span> {selected.fullAddress || selected.address || '—'}</p>
              <p className="text-sm"><span className="text-zinc-500">Bairro:</span> {selected.neighborhood || '—'}</p>
              <p className="text-sm"><span className="text-zinc-500">Distância:</span> {fmtDistance(selected.distanceKm)}</p>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-3">
              <h2 className="text-amber-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <MapPin size={14} /> Localização
              </h2>
              <StreetMapPreview
                lat={selected.lat != null && Number.isFinite(Number(selected.lat)) ? Number(selected.lat) : null}
                lng={selected.lng != null && Number.isFinite(Number(selected.lng)) ? Number(selected.lng) : null}
                message="Sem coordenadas para exibir o mapa."
              />
            </section>

            <section className="rounded-2xl border border-amber-500/30 bg-zinc-900/80 p-4 space-y-4">
              <h2 className="text-amber-400 text-xs font-bold uppercase tracking-wider">Definir área</h2>

              <div>
                <p className="text-zinc-500 text-xs mb-2">Tipo</p>
                <div className="grid grid-cols-3 gap-2">
                  {COVERAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCoverageType(opt.value)}
                      className={`h-10 rounded-xl text-xs font-bold uppercase border ${
                        coverageType === opt.value
                          ? 'bg-amber-500 text-zinc-950 border-amber-500'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                      }`}
                    >
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-500 text-xs">Taxa de entrega (R$)</Label>
                  <Input
                    value={minFee}
                    onChange={(e) => setMinFee(e.target.value.replace(/[^\d.,]/g, ''))}
                    className="bg-zinc-950 border-zinc-800 h-11 text-white"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs">Valor por KM (opcional)</Label>
                  <Input
                    value={feePerKm}
                    onChange={(e) => setFeePerKm(e.target.value.replace(/[^\d.,]/g, ''))}
                    className="bg-zinc-950 border-zinc-800 h-11 text-white"
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div>
                <Label className="text-zinc-500 text-xs">Cor da área</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-11 w-14 rounded-lg bg-zinc-950 border border-zinc-800 p-1"
                  />
                  <span className="text-zinc-400 text-xs font-mono">{color}</span>
                </div>
              </div>

              <div>
                <p className="text-zinc-500 text-xs mb-2">Área de risco</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setRisk(false); setColor((c) => (c === '#ef4444' ? '#22c55e' : c)); }}
                    className={`h-10 rounded-xl text-xs font-bold uppercase border ${
                      !risk ? 'bg-emerald-500 text-zinc-950 border-emerald-500' : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    <span>Não</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRisk(true); setColor('#ef4444'); }}
                    className={`h-10 rounded-xl text-xs font-bold uppercase border ${
                      risk ? 'bg-red-500 text-white border-red-500' : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    <span>Sim</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleApprove()}
                  className="h-11 rounded-xl font-black text-xs uppercase"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 size={16} className={`animate-spin ${saving ? '' : 'hidden'}`} />
                    <span>🟢 Salvar área</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void handleReject(selected.id)}
                  className="h-11 rounded-xl font-black text-xs uppercase border-red-800 text-red-400 hover:bg-red-950/40"
                >
                  <span>🔴 Recusar</span>
                </Button>
              </div>
            </section>
          </div>
        )}
      </main>

      <AdminBottomNav active="/admin/solicitacoes-areas" />
    </div>
  );
}
