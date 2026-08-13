import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, Loader2, Play, Upload, Volume2 } from 'lucide-react';
import {
  getAdminNotificationSettings,
  updateAdminNotificationSettings,
} from '../../lib/api';
import {
  EVENT_LABELS,
  MASTER_VOLUME_STEPS,
  REPEAT_MODE_OPTIONS,
  REPEAT_OPTIONS,
  SOUND_LIBRARY,
  allSoundChoices,
  defaultNotificationSettings,
  detectDeviceKind,
  fileToCustomSound,
  loadNotificationSettings,
  normalizeNotificationSettings,
  playEventSound,
  playLibrarySound,
  requestPushPermission,
  saveNotificationSettingsLocal,
  showAdminPush,
  type EventSoundConfig,
  type MasterVolumeStep,
  type NotifEventKey,
  type NotificationSettings,
  type OutsideHoursMode,
  type RepeatIntervalSec,
  type RepeatMode,
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
  'overdue',
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

function RadioRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="border-zinc-600 bg-zinc-950 text-amber-500 focus:ring-amber-500"
      />
      {label}
    </label>
  );
}

function EventCard({
  eventKey,
  cfg,
  settings,
  onChange,
}: {
  eventKey: NotifEventKey;
  cfg: EventSoundConfig;
  settings: NotificationSettings;
  onChange: (next: EventSoundConfig) => void;
}) {
  const showRepeat = eventKey === 'newOrder' || eventKey === 'overdue';
  const showMessage =
    cfg.sound === 'voice_female' ||
    cfg.sound === 'voice_male' ||
    cfg.sound === 'custom' ||
    cfg.sound === 'smart_voice';
  const choices = allSoundChoices(settings);
  const mode = cfg.repeatMode || (cfg.repeatEnabled ? 'until_accepted' : 'none');

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
            {choices.map(o => (
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
          {cfg.sound === 'smart_voice' ? (
            <p className="text-[10px] text-zinc-500">
              🎙️ Voz Inteligente preparada para o futuro (IA ainda não integrada). Hoje usa voz local com roteiro fixo.
            </p>
          ) : null}
        </div>
      )}

      {showRepeat && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
          <Label className="text-zinc-400 text-xs uppercase font-bold tracking-wider">Repetição</Label>
          <div className="space-y-1.5">
            {REPEAT_MODE_OPTIONS.filter(o =>
              eventKey === 'newOrder' ? true : o.id !== 'until_accepted',
            ).map(o => (
              <RadioRow
                key={o.id}
                checked={mode === o.id}
                onChange={() => onChange({
                  ...cfg,
                  repeatMode: o.id as RepeatMode,
                  repeatEnabled: o.id !== 'none',
                })}
                label={o.label}
              />
            ))}
          </div>
          {mode !== 'none' ? (
            <div className="space-y-1.5 pt-1">
              <Label className="text-zinc-500 text-xs">Intervalo entre repetições</Label>
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
                    {sec}s
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
        onClick={() => playEventSound(cfg, settings, eventKey)}
        className="w-full h-9 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl text-xs font-bold"
      >
        <Volume2 size={14} className="mr-1.5" /> Testar
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
  const [pushStatus, setPushStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const deviceKind = detectDeviceKind();

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
          setSettings(loadNotificationSettings());
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
          ? `Permitido · dispositivo: ${deviceKind}`
          : Notification.permission === 'denied'
            ? 'Bloqueado no navegador'
            : 'Aguardando permissão',
      );
    } else {
      setPushStatus('Não suportado neste navegador');
    }
  }, [deviceKind]);

  const patchEvent = (key: NotifEventKey, next: EventSoundConfig) => {
    setSettings(s => {
      const events = { ...s.events, [key]: next };
      const delay = key === 'overdue'
        ? {
            ...s.delay,
            overdueEnabled: next.enabled,
            overdueSound: next.sound,
            overdueVolume: next.volume,
            overdueMessage: next.customMessage,
            repeatMode: next.repeatMode,
            repeatIntervalSec: next.repeatIntervalSec,
          }
        : s.delay;
      return { ...s, events, delay };
    });
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
      setError('Erro ao salvar. Preferências locais foram aplicadas neste aparelho.');
      saveNotificationSettingsLocal(settings);
    } finally {
      setSaving(false);
    }
  };

  const handleEnablePush = async () => {
    const perm = await requestPushPermission();
    if (perm === 'granted') {
      setPushStatus(`Permitido · dispositivo: ${deviceKind}`);
      setSettings(s => ({ ...s, pushEnabled: true }));
      await showAdminPush('Burger GN', 'Notificações ativas neste dispositivo.', 'burger-gn-test', {
        ...settings,
        pushEnabled: true,
      });
    } else if (perm === 'denied') {
      setPushStatus('Bloqueado no navegador — libere nas configurações do sistema');
    } else if (perm === 'unsupported') {
      setPushStatus('Não suportado neste navegador');
    } else {
      setPushStatus('Permissão não concedida');
    }
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploadError('');
    try {
      const custom = await fileToCustomSound(file);
      setSettings(s => ({
        ...s,
        customSounds: [...s.customSounds.filter(c => c.id !== custom.id), custom].slice(0, 20),
      }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Falha no upload');
    }
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
      {/* Master */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <h3 className="text-white font-black uppercase text-sm flex items-center gap-2">
          <Bell size={16} className="text-amber-500" /> Notificações e Sons
        </h3>
        <CheckboxRow
          checked={settings.masterEnabled}
          onChange={v => setSettings(s => ({ ...s, masterEnabled: v }))}
          label="Ativar sistema de sons e notificações"
        />

        <div className="space-y-2 pt-1">
          <Label className="text-zinc-400 text-xs uppercase font-bold tracking-wider">🔊 Volume Geral</Label>
          <div className="flex flex-wrap gap-2">
            {MASTER_VOLUME_STEPS.map(step => (
              <button
                key={step.label}
                type="button"
                onClick={() => setSettings(s => ({ ...s, masterVolume: step.value as MasterVolumeStep }))}
                className={`px-3 py-2 rounded-xl text-xs font-black border ${
                  settings.masterVolume === step.value
                    ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sound library */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <h4 className="text-white font-black uppercase text-sm">🎵 Biblioteca de Sons</h4>
        <div className="space-y-2">
          {SOUND_LIBRARY.map(sound => (
            <div
              key={sound.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-white text-sm font-bold truncate">
                  {sound.emoji} {sound.label}
                </p>
                {sound.group === 'future' ? (
                  <p className="text-[10px] text-zinc-500">Estrutura futura · IA ainda não integrada</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => playLibrarySound(sound.id, settings, EVENT_LABELS.newOrder)}
                className="h-8 shrink-0 border-zinc-700 text-zinc-200 hover:bg-zinc-800 rounded-lg text-[11px] font-bold"
              >
                <Play size={12} className="mr-1" /> Testar
              </Button>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-dashed border-zinc-700 p-3 space-y-2">
          <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">📁 Meus áudios</p>
          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav,audio/wave"
            className="hidden"
            onChange={e => void handleUpload(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="w-full h-10 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl text-xs font-bold"
          >
            <Upload size={14} className="mr-1.5" /> Enviar .mp3 ou .wav
          </Button>
          {uploadError ? <p className="text-red-400 text-xs">{uploadError}</p> : null}
          {settings.customSounds.length === 0 ? (
            <p className="text-zinc-600 text-xs">Nenhum áudio enviado ainda.</p>
          ) : (
            <div className="space-y-2">
              {settings.customSounds.map(c => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 px-3 py-2"
                >
                  <span className="text-zinc-300 text-xs font-bold truncate">📁 {c.name}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => playLibrarySound(`upload:${c.id}`, settings)}
                      className="h-8 border-zinc-700 text-zinc-200 rounded-lg text-[11px] font-bold"
                    >
                      <Play size={12} className="mr-1" /> Testar
                    </Button>
                    <button
                      type="button"
                      className="text-[10px] text-red-400 font-bold px-2"
                      onClick={() => setSettings(s => ({
                        ...s,
                        customSounds: s.customSounds.filter(x => x.id !== c.id),
                      }))}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schedule */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <h4 className="text-white font-black uppercase text-sm">🕒 Horário das Notificações</h4>
        <CheckboxRow
          checked={settings.schedule.enabled}
          onChange={v => setSettings(s => ({
            ...s,
            schedule: { ...s.schedule, enabled: v },
          }))}
          label="Usar horário de funcionamento das notificações"
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-zinc-500 text-xs">Início</Label>
            <Input
              type="time"
              value={settings.schedule.start}
              onChange={e => setSettings(s => ({
                ...s,
                schedule: { ...s.schedule, start: e.target.value || '08:00' },
              }))}
              className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-zinc-500 text-xs">Fim</Label>
            <Input
              type="time"
              value={settings.schedule.end}
              onChange={e => setSettings(s => ({
                ...s,
                schedule: { ...s.schedule, end: e.target.value || '23:30' },
              }))}
              className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500"
            />
          </div>
        </div>
        <p className="text-zinc-500 text-[11px]">Fora desse horário:</p>
        <div className="space-y-1.5">
          <RadioRow
            checked={settings.schedule.outsideMode === 'silent_push'}
            onChange={() => setSettings(s => ({
              ...s,
              schedule: { ...s.schedule, outsideMode: 'silent_push' as OutsideHoursMode },
            }))}
            label="Apenas notificação silenciosa"
          />
          <RadioRow
            checked={settings.schedule.outsideMode === 'mute_all'}
            onChange={() => setSettings(s => ({
              ...s,
              schedule: { ...s.schedule, outsideMode: 'mute_all' as OutsideHoursMode },
            }))}
            label="Não tocar sons (nem push)"
          />
        </div>
      </div>

      {/* Push devices */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <h4 className="text-white font-black uppercase text-sm">📲 Push Notifications</h4>
        <CheckboxRow
          checked={settings.pushEnabled}
          onChange={v => setSettings(s => ({ ...s, pushEnabled: v }))}
          label="Ativar notificações push"
        />
        <div className="grid grid-cols-2 gap-2">
          {([
            ['notebook', 'Notebook'],
            ['android', 'Android / Celular'],
            ['tablet', 'Tablet'],
            ['pwa', 'PWA instalado'],
          ] as const).map(([key, label]) => (
            <CheckboxRow
              key={key}
              checked={settings.pushDevices[key]}
              onChange={v => setSettings(s => ({
                ...s,
                pushDevices: { ...s.pushDevices, [key]: v },
              }))}
              label={label}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            onClick={() => void handleEnablePush()}
            className="h-9 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs"
          >
            Permitir neste aparelho
          </Button>
          <span className="text-zinc-500 text-[11px]">{pushStatus}</span>
        </div>
      </div>

      {/* Per-stage */}
      <div className={`space-y-3 ${settings.masterEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
        <h4 className="text-zinc-400 text-xs font-black uppercase tracking-wider px-0.5">
          Notificações por etapa
        </h4>
        {EVENT_KEYS.map(key => (
          <EventCard
            key={key}
            eventKey={key}
            cfg={settings.events[key]}
            settings={settings}
            onChange={next => patchEvent(key, next)}
          />
        ))}

        <div className="rounded-2xl border border-red-500/30 bg-zinc-950/50 p-4 space-y-3">
          <h4 className="text-white font-black uppercase text-xs tracking-wider">Avisos antes do atraso</h4>
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
                {allSoundChoices(settings).map(o => (
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
          <Button
            type="button"
            variant="outline"
            onClick={() => playLibrarySound(settings.delay.sound, settings, settings.delay.customMessage)}
            className="w-full h-9 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl text-xs font-bold"
          >
            <Play size={12} className="mr-1.5" /> Testar aviso
          </Button>
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
