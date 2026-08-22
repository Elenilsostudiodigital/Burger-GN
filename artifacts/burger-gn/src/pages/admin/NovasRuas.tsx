import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  getAdminStreetRequests,
  getAdminStreetRequest,
  approveStreetRequest,
  rejectStreetRequest,
  DeliveryStreetRequest,
  StreetRequestDetail,
} from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { StreetMapPreview } from '../../components/StreetMapPreview';
import { acquireAdminOrderStream, releaseAdminOrderStream } from '../../lib/adminOrderStream';
import { ArrowLeft, Loader2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function fmtMoney(v: number | null | undefined) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')}`;
}

export default function AdminNovasRuas() {
  const [, setLocation] = useLocation();
  const [list, setList] = useState<DeliveryStreetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StreetRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [feeInput, setFeeInput] = useState('');
  const [etaInput, setEtaInput] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      setList(await getAdminStreetRequests('pending'));
    } catch {
      setError('Não foi possível carregar as solicitações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const es = acquireAdminOrderStream();
    const onStreet = () => { void refresh(); };
    es.addEventListener('street_request', onStreet);
    es.addEventListener('street_request_resolved', onStreet);
    return () => {
      es.removeEventListener('street_request', onStreet);
      es.removeEventListener('street_request_resolved', onStreet);
      releaseAdminOrderStream(es);
    };
  }, []);

  const openAnalyze = async (id: number) => {
    setSelectedId(id);
    setDetailLoading(true);
    setError('');
    try {
      const data = await getAdminStreetRequest(id);
      setDetail(data);
      const suggested = data.request.suggestedFee;
      setFeeInput(suggested != null ? String(suggested) : '');
      setEtaInput(data.request.etaMinutes != null ? String(data.request.etaMinutes) : '');
      setNotes('');
    } catch {
      setError('Não foi possível abrir a análise.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedId) return;
    const fee = parseFloat(feeInput.replace(',', '.'));
    if (!Number.isFinite(fee) || fee < 0) {
      setError('Informe uma taxa válida.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await approveStreetRequest(selectedId, {
        fee,
        etaMinutes: etaInput ? Number(etaInput) : undefined,
        notes,
        routeDistanceKm: detail?.request.routeDistanceKm ?? undefined,
        distanceKm: detail?.request.distanceKm ?? undefined,
      });
      setSelectedId(null);
      setDetail(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      await rejectStreetRequest(selectedId);
      setSelectedId(null);
      setDetail(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao recusar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      <header className="sticky top-0 z-30 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3 backdrop-blur">
        <div className="admin-shell flex items-center gap-3">
          <button type="button" onClick={() => setLocation('/admin')} className="p-2 text-zinc-400 hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-amber-500 text-[10px] font-bold uppercase tracking-widest">Entrega</p>
            <h1 className="font-black text-sm uppercase tracking-tight">📍 Novas Ruas</h1>
          </div>
          <Link href="/admin/ruas-entrega" className="ml-auto text-amber-500 text-[10px] font-bold uppercase">
            Ruas cadastradas
          </Link>
        </div>
      </header>

      <main className="admin-shell px-4 py-4 space-y-4">
        {error ? <p className="text-red-400 text-sm">{error}</p> : null}

        {!selectedId ? (
          loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber-500" /></div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-zinc-500 text-sm">
              Nenhuma rua nova aguardando análise.
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((r) => (
                <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white font-black text-sm truncate">{r.streetName}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">
                        {r.neighborhood || '—'} · {r.city || '—'}
                        {r.cep ? ` · CEP ${r.cep}` : ''}
                      </p>
                      <p className="text-zinc-400 text-xs mt-1">
                        Cliente: {r.customerName || '—'}
                        {r.orderNumber != null ? ` · Pedido #${r.orderNumber}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => void openAnalyze(r.id)}
                      className="h-9 rounded-xl text-xs font-bold shrink-0"
                    >
                      <Search size={14} className="mr-1" /> Analisar
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
              onClick={() => { setSelectedId(null); setDetail(null); }}
              className="text-zinc-500 text-xs font-bold uppercase hover:text-amber-400"
            >
              ← Voltar à lista
            </button>

            {detailLoading || !detail ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber-500" /></div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-2">
                  <h2 className="text-amber-500 text-xs font-bold uppercase tracking-wider">Solicitação</h2>
                  <p className="text-sm"><span className="text-zinc-500">Cliente:</span> {detail.request.customerName || '—'}</p>
                  <p className="text-sm"><span className="text-zinc-500">Rua:</span> {detail.request.streetName}</p>
                  <p className="text-sm"><span className="text-zinc-500">Bairro:</span> {detail.request.neighborhood || '—'}</p>
                  <p className="text-sm"><span className="text-zinc-500">Cidade:</span> {detail.request.city || '—'}</p>
                  <p className="text-sm"><span className="text-zinc-500">CEP:</span> {detail.request.cep || '—'}</p>
                  <p className="text-sm">
                    <span className="text-zinc-500">Pedido:</span>{' '}
                    {detail.request.orderNumber != null ? `#${detail.request.orderNumber}` : 'Ainda sem pedido'}
                  </p>
                </section>

                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-3">
                  <h2 className="text-amber-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={14} /> Localização
                  </h2>
                  {/* Static map only — never mount/unmount an OSM iframe here */}
                  <StreetMapPreview
                    lat={
                      detail.request.lat != null && Number.isFinite(Number(detail.request.lat))
                        ? Number(detail.request.lat)
                        : null
                    }
                    lng={
                      detail.request.lng != null && Number.isFinite(Number(detail.request.lng))
                        ? Number(detail.request.lng)
                        : null
                    }
                    message="Sem coordenadas para exibir o mapa."
                  />
                  <div className="space-y-1 text-sm">
                    <p>
                      Distância pela rota:{' '}
                      <strong className="text-amber-400">
                        {detail.request.routeDistanceKm != null
                          ? `${Number(detail.request.routeDistanceKm).toFixed(1)} km`
                          : '—'}
                      </strong>
                    </p>
                    <p>
                      Tempo estimado:{' '}
                      <strong className="text-amber-400">
                        {detail.request.etaMinutes != null ? `${detail.request.etaMinutes} min` : '—'}
                      </strong>
                    </p>
                    <p className="text-zinc-500 text-xs">
                      Base checkout (Haversine):{' '}
                      {detail.request.distanceKm != null
                        ? `${Number(detail.request.distanceKm).toFixed(1)} km`
                        : '—'}
                    </p>
                  </div>
                </section>
              </div>
            )}

            {detail && !detailLoading ? (
              <section className="rounded-2xl border border-amber-500/30 bg-zinc-900/80 p-4 space-y-3">
                <h2 className="text-amber-400 text-xs font-bold uppercase tracking-wider">Sugestão de taxa</h2>
                <p className="text-zinc-400 text-xs">
                  Calculada com a distância da rota e as faixas KM já usadas no checkout. Você pode editar antes de salvar.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-500 text-xs">Taxa (R$)</Label>
                    <Input
                      value={feeInput}
                      onChange={(e) => setFeeInput(e.target.value.replace(/[^\d.,]/g, ''))}
                      className="bg-zinc-950 border-zinc-800 h-11 text-white"
                      inputMode="decimal"
                    />
                    {detail.request.suggestedFee != null ? (
                      <p className="text-zinc-600 text-[10px] mt-1">Sugestão: {fmtMoney(detail.request.suggestedFee)}</p>
                    ) : null}
                  </div>
                  <div>
                    <Label className="text-zinc-500 text-xs">Tempo médio (min)</Label>
                    <Input
                      value={etaInput}
                      onChange={(e) => setEtaInput(e.target.value.replace(/\D/g, ''))}
                      className="bg-zinc-950 border-zinc-800 h-11 text-white"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-500 text-xs">Observações</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 h-11 text-white"
                    placeholder="Opcional"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleApprove()}
                    className="h-11 rounded-xl font-black text-xs uppercase"
                  >
                    {saving ? <Loader2 className="animate-spin" size={16} /> : '✅ Aprovar Rua'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void handleReject()}
                    className="h-11 rounded-xl font-black text-xs uppercase border-red-800 text-red-400 hover:bg-red-950/40"
                  >
                    ❌ Não entregamos
                  </Button>
                </div>
              </section>
            ) : null}
          </div>
        )}
      </main>

      <AdminBottomNav active="/admin/novas-ruas" />
    </div>
  );
}
