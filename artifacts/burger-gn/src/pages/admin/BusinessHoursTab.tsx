import React, { useEffect, useMemo, useState } from 'react';
import {
  getAdminBusinessHours,
  updateBusinessHours,
  openStoreNow,
  closeStoreNow,
  followBusinessHoursSchedule,
  BusinessHoursAdmin,
  BusinessHoursDaySchedule,
  WeekdayKey,
  WeeklySchedule,
} from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Check, X, Loader2, Store, Clock, CalendarDays,
} from 'lucide-react';

const WEEK_ORDER: WeekdayKey[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

function cloneSchedule(s: WeeklySchedule): WeeklySchedule {
  return JSON.parse(JSON.stringify(s)) as WeeklySchedule;
}

export function BusinessHoursTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [data, setData] = useState<BusinessHoursAdmin | null>(null);
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [exceptionClosed, setExceptionClosed] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState('18:00');
  const [exceptionClose, setExceptionClose] = useState('23:00');
  const [hasException, setHasException] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const applyPayload = (payload: BusinessHoursAdmin) => {
    setData(payload);
    setSchedule(cloneSchedule(payload.weeklySchedule));
    const today = payload.status.localDate;
    const activeException = !!payload.exceptionDate && payload.exceptionDate === today;
    setHasException(activeException);
    setExceptionClosed(activeException ? !!payload.exceptionClosed : false);
    setExceptionOpen(payload.exceptionOpen || '18:00');
    setExceptionClose(payload.exceptionClose || '23:00');
  };

  const reload = async () => {
    const payload = await getAdminBusinessHours();
    applyPayload(payload);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        await reload();
      } catch {
        setError('Não foi possível carregar o horário de funcionamento');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const labels = data?.weekdayLabels;
  const status = data?.status;
  const isOpen = status?.isOpen === true;
  const manualMode = data?.manualMode ?? 'auto';

  const todayLabel = useMemo(() => {
    if (!status?.localDate || !labels) return 'Hoje';
    const key = WEEK_ORDER.find((k) => {
      // status.today is available on admin payload
      return true;
    });
    void key;
    return `Hoje (${status.localDate})`;
  }, [status?.localDate, labels]);

  const patchDay = (key: WeekdayKey, patch: Partial<BusinessHoursDaySchedule>) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: { ...prev[key], ...patch } };
    });
  };

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleToggleNow = async (action: 'open' | 'close' | 'auto') => {
    setToggling(true);
    setError('');
    try {
      const payload =
        action === 'open' ? await openStoreNow()
          : action === 'close' ? await closeStoreNow()
            : await followBusinessHoursSchedule();
      applyPayload(payload);
      flash(
        action === 'open' ? 'Loja aberta agora'
          : action === 'close' ? 'Loja fechada agora'
            : 'Seguindo horário automático',
      );
    } catch {
      setError('Não foi possível alterar o status da loja');
    } finally {
      setToggling(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!schedule) return;
    setSaving(true);
    setError('');
    try {
      const payload = await updateBusinessHours({ weeklySchedule: schedule });
      applyPayload(payload);
      flash('Horário semanal salvo');
    } catch {
      setError('Erro ao salvar horário semanal');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveException = async () => {
    if (!status?.localDate) return;
    setSaving(true);
    setError('');
    try {
      const payload = await updateBusinessHours({
        exceptionDate: status.localDate,
        exceptionClosed,
        exceptionOpen: exceptionClosed ? null : exceptionOpen,
        exceptionClose: exceptionClosed ? null : exceptionClose,
      });
      applyPayload(payload);
      flash('Exceção de hoje salva');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar exceção de hoje');
    } finally {
      setSaving(false);
    }
  };

  const handleClearException = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = await updateBusinessHours({ clearException: true });
      applyPayload(payload);
      flash('Exceção de hoje removida');
    } catch {
      setError('Erro ao remover exceção');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !schedule || !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-amber-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 space-y-4 ${isOpen ? 'border-green-800/60 bg-green-950/20' : 'border-red-800/60 bg-red-950/20'}`}>
        <div className="flex items-start gap-3">
          <Store size={22} className={isOpen ? 'text-green-400' : 'text-red-400'} />
          <div className="min-w-0 flex-1">
            <p className={`font-black uppercase tracking-wide text-base ${isOpen ? 'text-green-400' : 'text-red-400'}`}>
              {isOpen ? '🟢 Loja Aberta' : '🔴 Loja Fechada'}
            </p>
            <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
              {status?.message}
              {status?.nextOpenLabel ? ` · ${status.nextOpenLabel}` : ''}
            </p>
            <p className="text-zinc-600 text-[11px] mt-1">
              Modo: {manualMode === 'auto' ? 'Automático (horário)' : manualMode === 'open' ? 'Aberta manualmente' : 'Fechada manualmente'}
              {status?.localTime ? ` · Agora ${status.localTime}` : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            type="button"
            disabled={toggling || (isOpen && manualMode === 'open')}
            onClick={() => void handleToggleNow('open')}
            className="h-11 rounded-xl font-bold bg-green-600 hover:bg-green-500 text-white"
          >
            {toggling ? <Loader2 size={16} className="animate-spin" /> : null}
            Abrir agora
          </Button>
          <Button
            type="button"
            disabled={toggling || (!isOpen && manualMode === 'closed')}
            onClick={() => void handleToggleNow('close')}
            className="h-11 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white"
          >
            Fechar agora
          </Button>
          <Button
            type="button"
            disabled={toggling || manualMode === 'auto'}
            onClick={() => void handleToggleNow('auto')}
            variant="outline"
            className="h-11 rounded-xl font-bold border-zinc-700 text-zinc-200"
          >
            Seguir horário
          </Button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-amber-500" />
          <div>
            <h3 className="text-white font-black uppercase tracking-wide text-sm">Dias da semana</h3>
            <p className="text-zinc-500 text-xs mt-0.5">Ative cada dia e defina abertura/fechamento.</p>
          </div>
        </div>

        <div className="space-y-3">
          {WEEK_ORDER.map((key) => {
            const day = schedule[key];
            const label = labels?.[key] ?? key;
            return (
              <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-white font-bold text-sm">{label}</p>
                  <button
                    type="button"
                    onClick={() => patchDay(key, { active: !day.active })}
                    className={`shrink-0 h-8 px-3 rounded-lg text-xs font-bold uppercase ${day.active ? 'bg-green-500/15 text-green-400 border border-green-700/40' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'}`}
                  >
                    {day.active ? 'Ativo' : 'Fechado'}
                  </button>
                </div>
                {day.active ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-zinc-500 text-[11px]">Abertura</Label>
                      <Input
                        type="time"
                        value={day.open}
                        onChange={(e) => patchDay(key, { open: e.target.value })}
                        className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-zinc-500 text-[11px]">Fechamento</Label>
                      <Input
                        type="time"
                        value={day.close}
                        onChange={(e) => patchDay(key, { close: e.target.value })}
                        className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-600 text-xs">Fechado neste dia</p>
                )}
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveSchedule()}
          className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          Salvar horário semanal
        </Button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-amber-500" />
          <div>
            <h3 className="text-white font-black uppercase tracking-wide text-sm">Exceção do dia</h3>
            <p className="text-zinc-500 text-xs mt-0.5">
              Altera só {todayLabel} — não muda a programação semanal.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setHasException(true); setExceptionClosed(false); }}
            className={`flex-1 h-10 rounded-xl text-xs font-bold uppercase border ${!exceptionClosed ? 'bg-amber-500/15 text-amber-400 border-amber-700/40' : 'bg-zinc-950 text-zinc-500 border-zinc-800'}`}
          >
            Horário especial
          </button>
          <button
            type="button"
            onClick={() => { setHasException(true); setExceptionClosed(true); }}
            className={`flex-1 h-10 rounded-xl text-xs font-bold uppercase border ${exceptionClosed ? 'bg-red-500/15 text-red-400 border-red-700/40' : 'bg-zinc-950 text-zinc-500 border-zinc-800'}`}
          >
            Hoje fechado
          </button>
        </div>

        {!exceptionClosed && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-zinc-500 text-[11px]">Abrir hoje às</Label>
              <Input
                type="time"
                value={exceptionOpen}
                onChange={(e) => setExceptionOpen(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-500 text-[11px]">Fechar hoje às</Label>
              <Input
                type="time"
                value={exceptionClose}
                onChange={(e) => setExceptionClose(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveException()}
            className="h-11 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950"
          >
            Salvar exceção de hoje
          </Button>
          <Button
            type="button"
            disabled={saving || !hasException}
            variant="outline"
            onClick={() => void handleClearException()}
            className="h-11 rounded-xl font-bold border-zinc-700"
          >
            Remover exceção
          </Button>
        </div>
      </div>

      {success ? (
        <p className="text-green-400 text-sm px-1 flex items-center gap-2"><Check size={16} /> {success}</p>
      ) : null}
      {error ? (
        <p className="text-red-400 text-sm px-1 flex items-center gap-2"><X size={16} /> {error}</p>
      ) : null}
    </div>
  );
}
