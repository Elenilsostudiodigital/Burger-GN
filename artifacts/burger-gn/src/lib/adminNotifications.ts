/** Admin notification & sound preferences (Config → Notificações e Sons). */

export const NOTIFICATION_SETTINGS_KEY = 'burger_gn_notification_settings';
/** Legacy Dashboard beep flag — silenced when the new engine is active. */
export const LEGACY_SOUND_KEY = 'admin_sound_enabled';

export type SoundId =
  | 'doorbell'
  | 'alarm'
  | 'bell'
  | 'notification'
  | 'voice_female'
  | 'voice_male'
  | 'custom';

export type RepeatIntervalSec = 5 | 10 | 15 | 30;

export type NotifEventKey =
  | 'newOrder'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'outForDelivery'
  | 'delivered';

export interface EventSoundConfig {
  enabled: boolean;
  sound: SoundId;
  volume: number;
  customMessage: string;
  /** New order only: repeat until accepted */
  repeatEnabled?: boolean;
  repeatIntervalSec?: RepeatIntervalSec;
}

export interface DelayWarningConfig {
  enabled: boolean;
  sound: SoundId;
  volume: number;
  customMessage: string;
  warnAtMinutes: number[];
  overdueEnabled: boolean;
  overdueSound: SoundId;
  overdueVolume: number;
  overdueMessage: string;
}

export interface NotificationSettings {
  version: 1;
  masterEnabled: boolean;
  pushEnabled: boolean;
  events: Record<NotifEventKey, EventSoundConfig>;
  delay: DelayWarningConfig;
}

export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: 'doorbell', label: 'Campainha' },
  { id: 'alarm', label: 'Alarme' },
  { id: 'bell', label: 'Sino' },
  { id: 'notification', label: 'Notificação' },
  { id: 'voice_female', label: 'Voz feminina' },
  { id: 'voice_male', label: 'Voz masculina' },
  { id: 'custom', label: 'Mensagem personalizada' },
];

export const REPEAT_OPTIONS: RepeatIntervalSec[] = [5, 10, 15, 30];

export const EVENT_LABELS: Record<NotifEventKey, string> = {
  newOrder: 'Novo Pedido',
  accepted: 'Pedido Aceito',
  preparing: 'Em Preparo',
  ready: 'Pedido Pronto',
  outForDelivery: 'Saiu para Entrega',
  delivered: 'Pedido Entregue',
};

const DEFAULT_MESSAGES: Record<NotifEventKey, string> = {
  newOrder: 'Novo pedido recebido',
  accepted: 'Pedido aceito',
  preparing: 'Pedido em preparo',
  ready: 'Pedido pronto',
  outForDelivery: 'Pedido saiu para entrega',
  delivered: 'Pedido entregue',
};

function defaultEvent(key: NotifEventKey, extra: Partial<EventSoundConfig> = {}): EventSoundConfig {
  return {
    enabled: true,
    sound: key === 'newOrder' ? 'doorbell' : 'notification',
    volume: 0.7,
    customMessage: DEFAULT_MESSAGES[key],
    ...extra,
  };
}

export function defaultNotificationSettings(): NotificationSettings {
  return {
    version: 1,
    masterEnabled: true,
    pushEnabled: true,
    events: {
      newOrder: defaultEvent('newOrder', {
        sound: 'doorbell',
        repeatEnabled: true,
        repeatIntervalSec: 10,
      }),
      accepted: defaultEvent('accepted', { sound: 'bell' }),
      preparing: defaultEvent('preparing', { sound: 'notification', enabled: false }),
      ready: defaultEvent('ready', { sound: 'alarm', customMessage: 'Pedido pronto para entrega' }),
      outForDelivery: defaultEvent('outForDelivery', { sound: 'notification' }),
      delivered: defaultEvent('delivered', { sound: 'bell', enabled: false }),
    },
    delay: {
      enabled: true,
      sound: 'notification',
      volume: 0.65,
      customMessage: 'Atenção: pedido perto do atraso',
      warnAtMinutes: [15, 10, 5],
      overdueEnabled: true,
      overdueSound: 'alarm',
      overdueVolume: 0.85,
      overdueMessage: 'Alerta: pedido em atraso',
    },
  };
}

function clampVolume(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return 0.7;
  return Math.min(1, Math.max(0, n));
}

export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  const base = defaultNotificationSettings();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<NotificationSettings>;
  const events = { ...base.events };
  for (const key of Object.keys(events) as NotifEventKey[]) {
    const e = (r.events as Record<string, Partial<EventSoundConfig>> | undefined)?.[key];
    if (!e) continue;
    events[key] = {
      ...events[key],
      enabled: e.enabled !== undefined ? !!e.enabled : events[key].enabled,
      sound: (SOUND_OPTIONS.some(s => s.id === e.sound) ? e.sound : events[key].sound) as SoundId,
      volume: e.volume !== undefined ? clampVolume(e.volume) : events[key].volume,
      customMessage: typeof e.customMessage === 'string' ? e.customMessage.slice(0, 120) : events[key].customMessage,
      repeatEnabled: e.repeatEnabled !== undefined ? !!e.repeatEnabled : events[key].repeatEnabled,
      repeatIntervalSec: ([5, 10, 15, 30] as number[]).includes(Number(e.repeatIntervalSec))
        ? (Number(e.repeatIntervalSec) as RepeatIntervalSec)
        : events[key].repeatIntervalSec,
    };
  }
  const d = (r.delay || {}) as Partial<DelayWarningConfig>;
  const warnAt = Array.isArray(d.warnAtMinutes)
    ? d.warnAtMinutes.map((n: number) => Number(n)).filter((n: number) => [15, 10, 5].includes(n))
    : base.delay.warnAtMinutes;
  return {
    version: 1,
    masterEnabled: r.masterEnabled !== undefined ? !!r.masterEnabled : base.masterEnabled,
    pushEnabled: r.pushEnabled !== undefined ? !!r.pushEnabled : base.pushEnabled,
    events,
    delay: {
      ...base.delay,
      enabled: d.enabled !== undefined ? !!d.enabled : base.delay.enabled,
      sound: (SOUND_OPTIONS.some(s => s.id === d.sound) ? d.sound! : base.delay.sound),
      volume: d.volume !== undefined ? clampVolume(d.volume) : base.delay.volume,
      customMessage: typeof d.customMessage === 'string' ? d.customMessage.slice(0, 120) : base.delay.customMessage,
      warnAtMinutes: warnAt.length ? warnAt : base.delay.warnAtMinutes,
      overdueEnabled: d.overdueEnabled !== undefined ? !!d.overdueEnabled : base.delay.overdueEnabled,
      overdueSound: (SOUND_OPTIONS.some(s => s.id === d.overdueSound) ? d.overdueSound! : base.delay.overdueSound),
      overdueVolume: d.overdueVolume !== undefined ? clampVolume(d.overdueVolume) : base.delay.overdueVolume,
      overdueMessage: typeof d.overdueMessage === 'string' ? d.overdueMessage.slice(0, 120) : base.delay.overdueMessage,
    },
  };
}

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (raw) return normalizeNotificationSettings(JSON.parse(raw));
  } catch { /* ignore */ }
  return defaultNotificationSettings();
}

export function saveNotificationSettingsLocal(settings: NotificationSettings): void {
  const normalized = normalizeNotificationSettings(settings);
  localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(normalized));
  // Silence legacy Dashboard beep so the new engine owns audio (no Dashboard code change).
  localStorage.setItem(LEGACY_SOUND_KEY, 'false');
  window.dispatchEvent(new CustomEvent('burger-gn-notif-settings', { detail: normalized }));
}

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  dur: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function playDoorbell(volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 880, 0, 0.18, volume * 0.45);
  tone(ctx, 1175, 0.16, 0.22, volume * 0.4);
  tone(ctx, 988, 0.36, 0.28, volume * 0.35);
}

function playAlarm(volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  for (let i = 0; i < 4; i++) {
    tone(ctx, 740, i * 0.22, 0.12, volume * 0.5, 'square');
    tone(ctx, 520, i * 0.22 + 0.1, 0.1, volume * 0.4, 'square');
  }
}

function playBell(volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 1046, 0, 0.6, volume * 0.35);
  tone(ctx, 1318, 0.05, 0.55, volume * 0.25);
  tone(ctx, 1568, 0.1, 0.5, volume * 0.18);
}

function playNotification(volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 660, 0, 0.12, volume * 0.4);
  tone(ctx, 880, 0.12, 0.18, volume * 0.35);
}

function speak(message: string, volume: number, pitch: number) {
  try {
    if (!('speechSynthesis' in window)) {
      playNotification(volume);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(message || 'Atenção');
    u.lang = 'pt-BR';
    u.volume = clampVolume(volume);
    u.pitch = pitch;
    u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch {
    playNotification(volume);
  }
}

export function playSoundId(sound: SoundId, volume: number, message?: string) {
  const v = clampVolume(volume);
  switch (sound) {
    case 'doorbell':
      playDoorbell(v);
      break;
    case 'alarm':
      playAlarm(v);
      break;
    case 'bell':
      playBell(v);
      break;
    case 'notification':
      playNotification(v);
      break;
    case 'voice_female':
      speak(message || 'Atenção', v, 1.25);
      break;
    case 'voice_male':
      speak(message || 'Atenção', v, 0.75);
      break;
    case 'custom':
      speak(message || 'Mensagem personalizada', v, 1);
      break;
    default:
      playNotification(v);
  }
}

export function playEventSound(cfg: EventSoundConfig) {
  if (!cfg.enabled) return;
  playSoundId(cfg.sound, cfg.volume, cfg.customMessage);
}

export async function requestPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export async function showAdminPush(title: string, body: string, tag?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const opts: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: tag || 'burger-gn-admin',
    renotify: true,
    data: { url: '/admin/pedidos' },
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(title, opts);
      return;
    }
  } catch { /* fall through */ }
  try {
    // eslint-disable-next-line no-new
    new Notification(title, opts);
  } catch { /* ignore */ }
}

export function workflowToNotifEvent(workflow: string | undefined): NotifEventKey | null {
  switch (workflow) {
    case 'preparing':
    case 'accepted':
      return 'accepted';
    case 'ready':
      return 'ready';
    case 'out':
      return 'outForDelivery';
    case 'done':
    case 'finalized':
      return 'delivered';
    case 'new':
    case 'awaiting_payment':
      return 'newOrder';
    default:
      return null;
  }
}
