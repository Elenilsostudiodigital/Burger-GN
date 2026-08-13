import React, { useEffect, useState } from 'react';
import { Bell, Check, Loader2, Volume2 } from 'lucide-react';
import {
  getAdminNotificationSettings,
  updateAdminNotificationSettings,
} from '../../lib/api';
import {
  EVENT_LABELS,
  REPEAT_OPTIONS,
  SOUND_OPTIONS,
  defaultNotificationSettings,
  loadNotificationSettings,
  normalizeNotificationSettings,
  playEventSound,
  playSoundId,
  requestPushPermission,
  saveNotificationSettingsLocal,
  type EventSoundConfig,
  type NotifEventKey,
  type NotificationSettings,
  type RepeatIntervalSec,
  type SoundId,
} from '../../lib/adminNotifications';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EVENT_KEYS: NotifEventKey[] = [
  'newOrder',
  'accepted',
  'preparing',
  'ready',
  'outForDelivery',
  'delivered',
];

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-zinc-600 bg-zinc-950 text-amber-500 focus:ring-amber-500"
      />
      {label}
    </label>
  );
}

function EventCard({
  eventKey,
  cfg,
  onChange,
}: {
  eventKey: NotifEventKey;
  cfg: EventSoundConfig;
  onChange: (next: EventSoundConfig) => void;
}) {
  const isNew = eventKey === 'newOrder';
  const showMessage = cfg.sound === 'voice_female' || cfg.sound === 'voice_male' || cfg.sound === 'custom';

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-white font-black uppercase text-xs tracking-wider">{EVENT_LABELS[eventKey]}</h4>
        <CheckboxRow
          checked={cfg.enabled}
          onChange={v => onChange({ ...cfg, enabled: v })}
          label="Ativar"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-zinc-500 text-xs">Som</Label>
          <select
            value={cfg.sound}
            disabled={!cfg.enabled}
            onChange={e => onChange({ ...cfg, sound: e.target.value as SoundId })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 h-10 text-white text-sm focus:border-amber-500 focus:outline-none disabled:opacity-40"
          >
            {SOUND_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-500 text-xs">Volume ({Math.round(cfg.volume * 100)}%)</Label>
          <input
            type="range"
            min={0}
            max={100}
            disabled={!cfg.enabled}
            value={Math.round(cfg.volume * 100)}
            onChange={e => onChange({ ...cfg, volume: Number(e.target.value) / 100 })}
            className="w-full accent-amber-500 disabled:opacity-40"
          />
        </div>
      </div>

      {showMessage && (
        <div className="space-y-1.5">
          <Label className="text-zinc-500 text-xs">Mensagem sonora</Label>
          <Input
            value={cfg.customMessage}
            disabled={!cfg.enabled}
            onChange={e => onChange({ ...cfg, customMessage: e.target.value })}
            placeholder="Ex: Pedido pronto"
            className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
          />
        </div>
      )}

      {isNew && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
          <CheckboxRow
            checked={!!cfg.repeatEnabled}
            onChange={v => onChange({ ...cfg, repeatEnabled: v })}
            label="Repetir até o pedido ser aceito"
          />
          {cfg.repeatEnabled ? (
            <div className="space-y-1.5">
              <Label className="text-zinc-500 text-xs">Repetir a cada</Label>
              <div className="flex flex-wrap gap-2">
                {REPEAT_OPTIONS.map(sec => (
                  <button
                    key={sec}
                    type="button"
                    disabled={!cfg.enabled}
                    onClick={() => onChange({ ...cfg, repeatIntervalSec: sec as RepeatIntervalSec })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      cfg.repeatIntervalSec === sec
                        ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {sec} segundos
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        disabled={!cfg.enabled}
        onClick={() => playEventSound(cfg)}
        className="w-full h-9 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl text-xs font-bold"
      >
        <Volume2 size={14} className="mr-1.5" /> Testar som
      </Button>
    </div>
  );
}

export function NotificationsTab() {
  const [settings, setSettings] = useState<NotificationSettings>(() => loadNotificationSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [pushStatus, setPushStatus] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const remote = await getAdminNotificationSettings();
        if (remote?.config && Object.keys(remote.config).length > 0) {
          const normalized = normalizeNotificationSettings(remote.config);
          setSettings(normalized);
          saveNotificationSettingsLocal(normalized);
        } else {
          const local = loadNotificationSettings();
          setSettings(local);
        }
      } catch {
        setSettings(loadNotificationSettings());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPushStatus(
        Notification.permission === 'granted'
          ? 'Permitido neste dispositivo'
          : Notification.permission === 'denied'
            ? 'Bloqueado no navegador'
            : 'Aguardando permissão',
      );
    } else {
      setPushStatus('Não suportado neste navegador');
    }
  }, []);

  const patchEvent = (key: NotifEventKey, next: EventSoundConfig) => {
    setSettings(s => ({ ...s, events: { ...s.events, [key]: next } }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    setError('');
    try {
      const normalized = normalizeNotificationSettings(settings);
      saveNotificationSettingsLocal(normalized);
      await updateAdminNotificationSettings(normalized as unknown as Record<string, unknown>);
      setSettings(normalized);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Erro ao salvar notificações. Preferências locais foram aplicadas neste aparelho.');
      saveNotificationSettingsLocal(settings);
    } finally {
      setSaving(false);
    }
  };

  const handleEnablePush = async () => {
    const perm = await requestPushPermission();
    if (perm === 'granted') {
      setPushStatus('Permitido neste dispositivo');
      setSettings(s => ({ ...s, pushEnabled: true }));
      await showTestPush();
    } else if (perm === 'denied') {
      setPushStatus('Bloqueado no navegador — libere nas configurações do sistema');
    } else if (perm === 'unsupported') {
      setPushStatus('Não suportado neste navegador');
    } else {
      setPushStatus('Permissão não concedida');
    }
  };

  const showTestPush = async () => {
    const { showAdminPush } = await import('../../lib/adminNotifications');
    await showAdminPush('Burger GN', 'Notificações ativas neste dispositivo.', 'burger-gn-test');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-amber-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <h3 className="text-white font-black uppercase text-sm flex items-center gap-2">
          <Bell size={16} className="text-amber-500" /> Notificações e Sons
        </h3>
        <p className="text-zinc-500 text-xs leading-relaxed">
          Configure sons, volume, repetição e avisos de atraso. No PWA instalado, as notificações
          aparecem no notebook, celular ou tablet enquanto o painel estiver aberto ou em segundo plano.
        </p>
        <div className="flex flex-col gap-2">
          <CheckboxRow
            checked={settings.masterEnabled}
            onChange={v => setSettings(s => ({ ...s, masterEnabled: v }))}
            label="Ativar sistema de sons e notificações"
          />
          <CheckboxRow
            checked={settings.pushEnabled}
            onChange={v => setSettings(s => ({ ...s, pushEnabled: v }))}
            label="Notificações push (PWA / navegador)"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            onClick={() => void handleEnablePush()}
            className="h-9 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs"
          >
            Permitir notificações neste aparelho
          </Button>
          <span className="text-zinc-500 text-[11px]">{pushStatus}</span>
        </div>
      </div>

      <div className={`space-y-3 ${settings.masterEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
        {EVENT_KEYS.map(key => (
          <EventCard
            key={key}
            eventKey={key}
            cfg={settings.events[key]}
            onChange={next => patchEvent(key, next)}
          />
        ))}

        <div className="rounded-2xl border border-red-500/30 bg-zinc-950/50 p-4 space-y-3">
          <h4 className="text-white font-black uppercase text-xs tracking-wider">Pedido em Atraso</h4>
          <CheckboxRow
            checked={settings.delay.enabled}
            onChange={v => setSettings(s => ({ ...s, delay: { ...s.delay, enabled: v } }))}
            label="Avisar quando faltar tempo"
          />
          <div className="flex flex-wrap gap-3">
            {[15, 10, 5].map(m => (
              <CheckboxRow
                key={m}
                checked={settings.delay.warnAtMinutes.includes(m)}
                onChange={v => setSettings(s => ({
                  ...s,
                  delay: {
                    ...s.delay,
                    warnAtMinutes: v
                      ? [...new Set([...s.delay.warnAtMinutes, m])].sort((a, b) => b - a)
                      : s.delay.warnAtMinutes.filter(x => x !== m),
                  },
                }))}
                label={`${m} minutos`}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-500 text-xs">Som do aviso</Label>
              <select
                value={settings.delay.sound}
                onChange={e => setSettings(s => ({
                  ...s,
                  delay: { ...s.delay, sound: e.target.value as SoundId },
                }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 h-10 text-white text-sm focus:border-amber-500 focus:outline-none"
              >
                {SOUND_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-500 text-xs">Volume ({Math.round(settings.delay.volume * 100)}%)</Label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.delay.volume * 100)}
                onChange={e => setSettings(s => ({
                  ...s,
                  delay: { ...s.delay, volume: Number(e.target.value) / 100 },
                }))}
                className="w-full accent-amber-500"
              />
            </div>
          </div>
          <Input
            value={settings.delay.customMessage}
            onChange={e => setSettings(s => ({
              ...s,
              delay: { ...s.delay, customMessage: e.target.value },
            }))}
            placeholder="Mensagem do aviso"
            className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => playSoundId(settings.delay.sound, settings.delay.volume, settings.delay.customMessage)}
            className="w-full h-9 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl text-xs font-bold"
          >
            <Volume2 size={14} className="mr-1.5" /> Testar aviso
          </Button>

          <div className="border-t border-zinc-800 pt-3 space-y-3">
            <CheckboxRow
              checked={settings.delay.overdueEnabled}
              onChange={v => setSettings(s => ({ ...s, delay: { ...s.delay, overdueEnabled: v } }))}
              label="Alerta diferente quando entrar em atraso"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-500 text-xs">Som do atraso</Label>
                <select
                  value={settings.delay.overdueSound}
                  onChange={e => setSettings(s => ({
                    ...s,
                    delay: { ...s.delay, overdueSound: e.target.value as SoundId },
                  }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 h-10 text-white text-sm focus:border-amber-500 focus:outline-none"
                >
                  {SOUND_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-500 text-xs">Volume ({Math.round(settings.delay.overdueVolume * 100)}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(settings.delay.overdueVolume * 100)}
                  onChange={e => setSettings(s => ({
                    ...s,
                    delay: { ...s.delay, overdueVolume: Number(e.target.value) / 100 },
                  }))}
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
            <Input
              value={settings.delay.overdueMessage}
              onChange={e => setSettings(s => ({
                ...s,
                delay: { ...s.delay, overdueMessage: e.target.value },
              }))}
              placeholder="Mensagem de atraso"
              className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => playSoundId(
                settings.delay.overdueSound,
                settings.delay.overdueVolume,
                settings.delay.overdueMessage,
              )}
              className="w-full h-9 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl text-xs font-bold"
            >
              <Volume2 size={14} className="mr-1.5" /> Testar alerta de atraso
            </Button>
          </div>
        </div>
      </div>

      {error ? <p className="text-red-400 text-sm">{error}</p> : null}
      {success ? (
        <p className="text-emerald-400 text-sm flex items-center gap-1">
          <Check size={14} /> Configurações salvas
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl"
        >
          {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Check size={16} className="mr-2" />}
          Salvar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setSettings(defaultNotificationSettings())}
          className="h-11 border-zinc-700 text-zinc-400 hover:bg-zinc-800 rounded-xl text-xs"
        >
          Restaurar padrões
        </Button>
      </div>
    </div>
  );
}
