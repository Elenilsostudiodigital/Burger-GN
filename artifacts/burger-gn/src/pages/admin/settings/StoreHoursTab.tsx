import React, { useEffect, useState } from 'react';
import { Check, Loader2, X, Clock, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAdminStoreHours, updateStoreHours, StoreHours } from '../../../lib/api';

const DAYS = [
  { id: 0, label: 'Dom' },
  { id: 1, label: 'Seg' },
  { id: 2, label: 'Ter' },
  { id: 3, label: 'Qua' },
  { id: 4, label: 'Qui' },
  { id: 5, label: 'Sex' },
  { id: 6, label: 'Sáb' },
];

export function StoreHoursTab() {
  const [hours, setHours] = useState<StoreHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminStoreHours()
      .then(setHours)
      .catch(() => setError('Erro ao carregar horário'))
      .finally(() => setLoading(false));
  }, []);

  const toggleDay = (day: number) => {
    if (!hours) return;
    const has = hours.days.includes(day);
    setHours({
      ...hours,
      days: has ? hours.days.filter((d) => d !== day) : [...hours.days, day].sort(),
    });
  };

  const handleSave = async () => {
    if (!hours) return;
    setSaving(true); setSuccess(false); setError('');
    try {
      const updated = await updateStoreHours({
        openTime: hours.openTime,
        closeTime: hours.closeTime,
        days: hours.days,
        forceClosed: hours.forceClosed,
        forceOpen: hours.forceOpen,
      });
      setHours(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Erro ao salvar horário');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !hours) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-amber-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
        hours.isOpen ? 'border-green-800/40 bg-green-900/10' : 'border-amber-800/40 bg-amber-900/10'
      }`}>
        <Store size={20} className={hours.isOpen ? 'text-green-400 mt-0.5' : 'text-amber-400 mt-0.5'} />
        <div>
          <p className={`font-bold text-sm ${hours.isOpen ? 'text-green-400' : 'text-amber-400'}`}>
            {hours.isOpen ? 'Loja aberta agora' : 'Loja fechada agora'}
          </p>
          <p className="text-zinc-500 text-xs mt-1">
            Clientes podem navegar no cardápio mesmo fechado, mas novos pedidos ficam bloqueados.
          </p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-bold uppercase text-sm flex items-center gap-2">
          <Clock size={16} className="text-amber-500" /> Horário de funcionamento
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Abertura</Label>
            <Input type="time" value={hours.openTime}
              onChange={(e) => setHours({ ...hours, openTime: e.target.value })}
              className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Fechamento</Label>
            <Input type="time" value={hours.closeTime}
              onChange={(e) => setHours({ ...hours, closeTime: e.target.value })}
              className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-zinc-400 text-xs">Dias da semana</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => {
              const active = hours.days.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDay(d.id)}
                  className={`h-10 min-w-[48px] px-3 rounded-xl text-xs font-bold uppercase transition-colors ${
                    active
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-500'
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <Label className="text-zinc-400 text-xs uppercase font-bold">Status manual</Label>
        <button
          type="button"
          onClick={() => setHours({ ...hours, forceOpen: true, forceClosed: false })}
          className={`w-full h-11 rounded-xl font-bold text-sm ${
            hours.forceOpen ? 'bg-green-500 text-zinc-950' : 'bg-zinc-950 border border-zinc-800 text-zinc-400'
          }`}
        >
          Loja aberta
        </button>
        <button
          type="button"
          onClick={() => setHours({ ...hours, forceClosed: true, forceOpen: false })}
          className={`w-full h-11 rounded-xl font-bold text-sm ${
            hours.forceClosed ? 'bg-red-500 text-white' : 'bg-zinc-950 border border-zinc-800 text-zinc-400'
          }`}
        >
          Loja fechada
        </button>
        <button
          type="button"
          onClick={() => setHours({ ...hours, forceClosed: false, forceOpen: false })}
          className={`w-full h-11 rounded-xl font-bold text-sm ${
            !hours.forceClosed && !hours.forceOpen
              ? 'bg-amber-500 text-zinc-950'
              : 'bg-zinc-950 border border-zinc-800 text-zinc-400'
          }`}
        >
          Seguir horário automático
        </button>
      </div>

      {success && <p className="text-green-400 text-sm flex items-center gap-2"><Check size={16} /> Horário salvo!</p>}
      {error && <p className="text-red-400 text-sm flex items-center gap-2"><X size={16} /> {error}</p>}

      <Button onClick={handleSave} disabled={saving}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Salvar funcionamento
      </Button>
    </div>
  );
}
