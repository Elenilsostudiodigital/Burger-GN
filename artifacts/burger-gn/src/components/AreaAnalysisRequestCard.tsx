import React, { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import {
  approveStreetRequest,
  rejectStreetRequest,
  DeliveryStreetRequest,
} from '../lib/api';
import { StreetMapPreview } from './StreetMapPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function fmtMoney(v: number | null | undefined) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')}`;
}

export function AreaAnalysisRequestCard({
  request,
  onResolved,
  onError,
}: {
  request: DeliveryStreetRequest;
  onResolved: (id: number) => void;
  onError: (message: string) => void;
}) {
  const [fee, setFee] = useState(
    request.suggestedFee != null ? String(request.suggestedFee) : '',
  );
  const [saving, setSaving] = useState(false);

  const lat =
    request.lat != null && Number.isFinite(Number(request.lat))
      ? Number(request.lat)
      : null;
  const lng =
    request.lng != null && Number.isFinite(Number(request.lng))
      ? Number(request.lng)
      : null;

  const accept = async () => {
    const value = parseFloat(fee.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) {
      onError('Informe uma taxa de entrega válida.');
      return;
    }
    setSaving(true);
    try {
      await approveStreetRequest(request.id, {
        fee: value,
        etaMinutes: request.etaMinutes ?? undefined,
        distanceKm: request.distanceKm ?? undefined,
        routeDistanceKm: request.routeDistanceKm ?? undefined,
      });
      onResolved(request.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Não foi possível aceitar a solicitação.');
    } finally {
      setSaving(false);
    }
  };

  const refuse = async () => {
    setSaving(true);
    try {
      await rejectStreetRequest(request.id);
      onResolved(request.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Não foi possível recusar a solicitação.');
    } finally {
      setSaving(false);
    }
  };

  const createdAt = request.createdAt
    ? new Date(request.createdAt).toLocaleString('pt-BR')
    : '—';

  return (
    <article className="rounded-2xl border border-red-500/40 bg-red-950/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-red-300 font-black text-sm uppercase tracking-wide">
            Nova solicitação de área de entrega.
          </p>
          <p className="text-white font-bold text-sm mt-1 truncate">{request.streetName}</p>
          <p className="text-zinc-400 text-xs mt-0.5">
            {request.addressNumber ? `Nº ${request.addressNumber} · ` : ''}
            {request.neighborhood || '—'} · {request.city || 'Lauro de Freitas'}
            {request.cep ? ` · CEP ${request.cep}` : ''}
          </p>
          <p className="text-zinc-300 text-xs mt-1">
            Cliente: {request.customerName || '—'} · {request.phone || '—'}
          </p>
          <p className="text-zinc-500 text-[10px] mt-0.5">{createdAt}</p>
        </div>
        <span className="shrink-0 bg-red-500 text-white text-[10px] font-black uppercase px-2 py-1 rounded-full">
          Análise
        </span>
      </div>

      <div>
        <p className="text-zinc-500 text-[10px] font-bold uppercase mb-1.5 flex items-center gap-1">
          <MapPin size={12} /> Ver localização no mapa
        </p>
        <StreetMapPreview
          lat={lat}
          lng={lng}
          message="Sem coordenadas para exibir o mapa."
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-zinc-500 text-[10px] uppercase font-bold">Taxa de entrega (R$)</Label>
          <Input
            value={fee}
            onChange={(e) => setFee(e.target.value.replace(/[^\d.,]/g, ''))}
            className="bg-zinc-950 border-zinc-800 h-10 text-white mt-1"
            inputMode="decimal"
            placeholder="0,00"
          />
          {request.suggestedFee != null ? (
            <p className="text-zinc-600 text-[10px] mt-1">Sugestão: {fmtMoney(request.suggestedFee)}</p>
          ) : null}
        </div>
        <div className="flex flex-col justify-end text-xs text-zinc-500 pb-1">
          {request.distanceKm != null
            ? `${Number(request.distanceKm).toFixed(1).replace('.', ',')} km`
            : 'Distância a confirmar'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          disabled={saving}
          onClick={() => { void accept(); }}
          className="h-10 rounded-xl font-black text-xs uppercase bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : 'Aceitar'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => { void refuse(); }}
          className="h-10 rounded-xl font-black text-xs uppercase border-red-800 text-red-400 hover:bg-red-950/40"
        >
          Recusar
        </Button>
      </div>
    </article>
  );
}
