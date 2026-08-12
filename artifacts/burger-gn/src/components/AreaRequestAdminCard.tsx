import React, { useState } from 'react';
import {
  approveAreaRequest,
  rejectAreaRequest,
  DeliveryAreaRequest,
  AreaCoverageType,
} from '../lib/api';
import { StreetMapPreview } from './StreetMapPreview';
import { Loader2, MapPin, Phone } from 'lucide-react';
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

function osmUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

const COVERAGE_OPTIONS: { value: AreaCoverageType; label: string }[] = [
  { value: 'rua', label: 'Rua' },
  { value: 'bairro', label: 'Bairro' },
  { value: 'regiao', label: 'Região' },
];

export function AreaRequestAdminCard({
  request,
  onChanged,
}: {
  request: DeliveryAreaRequest;
  onChanged: () => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [coverageType, setCoverageType] = useState<AreaCoverageType>('regiao');
  const [minFee, setMinFee] = useState('8.00');
  const [feePerKm, setFeePerKm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);

  const lat = request.lat != null && Number.isFinite(Number(request.lat)) ? Number(request.lat) : null;
  const lng = request.lng != null && Number.isFinite(Number(request.lng)) ? Number(request.lng) : null;
  const hasCoords = lat != null && lng != null;

  const handleAccept = async () => {
    const fee = parseFloat(minFee.replace(',', '.'));
    if (!Number.isFinite(fee) || fee < 0) {
      setError('Informe uma taxa de entrega válida.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await approveAreaRequest(request.id, {
        type: coverageType,
        minFee: fee,
        feePerKm: feePerKm ? parseFloat(feePerKm.replace(',', '.')) : 0,
        color: '#22c55e',
        risk: false,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aceitar a área.');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    setSaving(true);
    setError('');
    try {
      await rejectAreaRequest(request.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao recusar.');
    } finally {
      setSaving(false);
    }
  };

  const openMap = () => {
    if (!hasCoords || lat == null || lng == null) {
      setError('Esta solicitação não tem coordenadas para o mapa.');
      return;
    }
    setMapOpen(true);
    window.open(osmUrl(lat, lng), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-zinc-900/90 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest">Solicitação de Área</p>
          <p className="text-white font-black text-sm truncate">{request.customerName || '—'}</p>
          <p className="text-zinc-400 text-xs mt-1 flex items-center gap-1.5">
            <Phone size={12} /> {request.phone || '—'}
          </p>
        </div>
        <p className="text-zinc-500 text-[10px] shrink-0">{fmtWhen(request.createdAt)}</p>
      </div>

      <div className="text-sm space-y-1">
        <p className="text-zinc-300 leading-relaxed">{request.fullAddress || request.address || '—'}</p>
        <p className="text-zinc-500 text-xs">Bairro: {request.neighborhood || '—'}</p>
        <p className="text-zinc-500 text-xs">Distância: {fmtDistance(request.distanceKm)}</p>
      </div>

      <div className={mapOpen ? '' : 'hidden'}>
        <StreetMapPreview
          lat={lat}
          lng={lng}
          message="Sem coordenadas para exibir o mapa."
        />
      </div>

      <p className={`text-red-400 text-xs ${error ? '' : 'hidden'}`}>{error || '—'}</p>

      <div className={accepting ? '' : 'hidden'}>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-3">
          <p className="text-zinc-400 text-xs font-bold uppercase">Definir taxa de entrega</p>
          <div className="grid grid-cols-3 gap-2">
            {COVERAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCoverageType(opt.value)}
                className={`h-9 rounded-xl text-[10px] font-bold uppercase border ${
                  coverageType === opt.value
                    ? 'bg-amber-500 text-zinc-950 border-amber-500'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                }`}
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
          <div>
            <Label className="text-zinc-500 text-xs">Taxa (R$)</Label>
            <Input
              value={minFee}
              onChange={(e) => setMinFee(e.target.value.replace(/[^\d.,]/g, ''))}
              className="bg-zinc-900 border-zinc-800 h-10 text-white"
              inputMode="decimal"
            />
          </div>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleAccept()}
            className="w-full h-11 rounded-xl font-black text-xs uppercase"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 size={16} className={`animate-spin ${saving ? '' : 'hidden'}`} />
              <span>Salvar área e liberar região</span>
            </span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={openMap}
          className="h-11 rounded-xl font-black text-[10px] uppercase border-zinc-700"
        >
          <span className="inline-flex items-center justify-center gap-1">
            <MapPin size={12} /> Ver no mapa
          </span>
        </Button>
        <Button
          type="button"
          disabled={saving}
          onClick={() => { setAccepting(true); setError(''); }}
          className="h-11 rounded-xl font-black text-[10px] uppercase"
        >
          <span>Aceitar</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => void handleReject()}
          className="h-11 rounded-xl font-black text-[10px] uppercase border-red-800 text-red-400 hover:bg-red-950/40"
        >
          <span>Recusar</span>
        </Button>
      </div>
    </div>
  );
}
