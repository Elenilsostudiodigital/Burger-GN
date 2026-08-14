/** Admin notification & sound preferences (Config → Notificações e Sons). */

export const NOTIFICATION_SETTINGS_KEY = 'burger_gn_notification_settings';
export const CUSTOM_SOUNDS_KEY = 'burger_gn_custom_sounds';
/** Legacy Dashboard beep flag — silenced when the new engine is active. */
export const LEGACY_SOUND_KEY = 'admin_sound_enabled';

export type BuiltinSoundId =
  | 'restaurant_bell'
  | 'new_order'
  | 'alarm'
  | 'classic'
  | 'voice_female'
  | 'voice_male'
  | 'soft'
  | 'strong'
  | 'smart_voice'
  /** @deprecated legacy — still playable */
  | 'doorbell'
  | 'bell'
  | 'notification'
  | 'custom';

export type SoundId = BuiltinSoundId | `upload:${string}`;

export type RepeatIntervalSec = 5 | 10 | 15 | 30;
export type RepeatMode = 'none' | 'times_3' | 'times_5' | 'until_accepted';
export type MasterVolumeStep = 0 | 0.25 | 0.5 | 0.75 | 1;
export type OutsideHoursMode = 'silent_push' | 'mute_all';

export type NotifEventKey =
  | 'newOrder'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'outForDelivery'
  | 'delivered'
  | 'overdue'
  | 'presenceOnline'
  | 'presenceCart'
  | 'presenceCheckout';

export interface CustomSound {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
  createdAt: string;
}

export interface EventSoundConfig {
  enabled: boolean;
  sound: SoundId;
  volume: number;
  customMessage: string;
  /** @deprecated use repeatMode */
  repeatEnabled?: boolean;
  repeatIntervalSec?: RepeatIntervalSec;
  repeatMode?: RepeatMode;
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
  /** Repetition for overdue alerts */
  repeatMode?: RepeatMode;
  repeatIntervalSec?: RepeatIntervalSec;
}

export interface NotificationSchedule {
  enabled: boolean;
  start: string; // HH:MM
  end: string;
  /** Outside window behaviour */
  outsideMode: OutsideHoursMode;
}

export interface PushDeviceFlags {
  notebook: boolean;
  android: boolean;
  tablet: boolean;
  pwa: boolean;
}

export interface NotificationSettings {
  version: 2;
  masterEnabled: boolean;
  /** Master volume steps: 0 / 25 / 50 / 75 / 100 */
  masterVolume: MasterVolumeStep;
  pushEnabled: boolean;
  pushDevices: PushDeviceFlags;
  schedule: NotificationSchedule;
  /** Future AI voice — structure only, no AI integration */
  smartVoicePrepared: boolean;
  events: Record<NotifEventKey, EventSoundConfig>;
  delay: DelayWarningConfig;
  customSounds: CustomSound[];
}

export const SOUND_LIBRARY: {
  id: BuiltinSoundId;
  label: string;
  emoji: string;
  group: 'builtin' | 'voice' | 'future';
}[] = [
  { id: 'restaurant_bell', label: 'Campainha Restaurante', emoji: '🔔', group: 'builtin' },
  { id: 'new_order', label: 'Novo Pedido', emoji: '📦', group: 'builtin' },
  { id: 'alarm', label: 'Alarme', emoji: '🚨', group: 'builtin' },
  { id: 'classic', label: 'Notificação Clássica', emoji: '🎶', group: 'builtin' },
  { id: 'voice_female', label: 'Voz Feminina', emoji: '📢', group: 'voice' },
  { id: 'voice_male', label: 'Voz Masculina', emoji: '📢', group: 'voice' },
  { id: 'soft', label: 'Som Suave', emoji: '🎧', group: 'builtin' },
  { id: 'strong', label: 'Som Forte', emoji: '🎧', group: 'builtin' },
  { id: 'smart_voice', label: 'Voz Inteligente', emoji: '🎙️', group: 'future' },
];

/** Selector options (library + legacy aliases kept for saved configs). */
export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  ...SOUND_LIBRARY.map(s => ({ id: s.id as SoundId, label: `${s.emoji} ${s.label}` })),
  { id: 'doorbell', label: 'Campainha (legado)' },
  { id: 'bell', label: 'Sino (legado)' },
  { id: 'notification', label: 'Notificação (legado)' },
  { id: 'custom', label: 'Mensagem personalizada (legado)' },
];

export const REPEAT_OPTIONS: RepeatIntervalSec[] = [5, 10, 15, 30];
export const MASTER_VOLUME_STEPS: { value: MasterVolumeStep; label: string }[] = [
  { value: 0, label: '0%' },
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
];

export const REPEAT_MODE_OPTIONS: { id: RepeatMode; label: string }[] = [
  { id: 'none', label: 'Não repetir' },
  { id: 'times_3', label: 'Repetir 3 vezes' },
  { id: 'times_5', label: 'Repetir 5 vezes' },
  { id: 'until_accepted', label: 'Repetir até aceitar' },
];

export const EVENT_LABELS: Record<NotifEventKey, string> = {
  newOrder: 'Novo Pedido',
  accepted: 'Pedido Aceito',
  preparing: 'Em Preparo',
  ready: 'Pedido Pronto',
  outForDelivery: 'Saiu para Entrega',
  delivered: 'Pedido Entregue',
  overdue: 'Pedido em Atraso',
  presenceOnline: 'Cliente Online (Cardápio)',
  presenceCart: 'Carrinho Ativo',
  presenceCheckout: 'Finalizando Pedido',
};

const DEFAULT_MESSAGES: Record<NotifEventKey, string> = {
  newOrder: 'Novo pedido recebido',
  accepted: 'Pedido aceito',
  preparing: 'Pedido em preparo',
  ready: 'Pedido pronto',
  outForDelivery: 'Pedido saiu para entrega',
  delivered: 'Pedido entregue',
  overdue: 'Pedido em atraso',
  presenceOnline: 'Novo cliente entrou no cardápio',
  presenceCart: 'Um cliente iniciou um pedido',
  presenceCheckout: 'Um cliente está finalizando um pedido',
};

const SMART_VOICE_SCRIPTS: Partial<Record<NotifEventKey, string>> = {
  newOrder: 'Novo pedido recebido.',
  preparing: 'Pedido em preparo.',
  ready: 'Pedido pronto.',
  overdue: 'Pedido em atraso.',
};

function defaultEvent(key: NotifEventKey, extra: Partial<EventSoundConfig> = {}): EventSoundConfig {
  const presence = key === 'presenceOnline' || key === 'presenceCart' || key === 'presenceCheckout';
  return {
    enabled: true,
    sound: key === 'newOrder' ? 'new_order' : key === 'overdue' ? 'alarm' : presence ? 'soft' : 'classic',
    volume: presence ? 0.45 : 0.7,
    customMessage: DEFAULT_MESSAGES[key],
    repeatMode: key === 'newOrder' ? 'until_accepted' : 'none',
    repeatIntervalSec: 10,
    ...extra,
  };
}

export function defaultNotificationSettings(): NotificationSettings {
  return {
    version: 2,
    masterEnabled: true,
    masterVolume: 1,
    pushEnabled: true,
    pushDevices: { notebook: true, android: true, tablet: true, pwa: true },
    schedule: {
      enabled: false,
      start: '08:00',
      end: '23:30',
      outsideMode: 'silent_push',
    },
    smartVoicePrepared: true,
    events: {
      newOrder: defaultEvent('newOrder', {
        sound: 'new_order',
        repeatMode: 'until_accepted',
        repeatIntervalSec: 10,
        repeatEnabled: true,
      }),
      accepted: defaultEvent('accepted', { sound: 'restaurant_bell' }),
      preparing: defaultEvent('preparing', { sound: 'classic', enabled: false }),
      ready: defaultEvent('ready', { sound: 'alarm', customMessage: 'Pedido pronto para entrega' }),
      outForDelivery: defaultEvent('outForDelivery', { sound: 'classic' }),
      delivered: defaultEvent('delivered', { sound: 'soft', enabled: false }),
      overdue: defaultEvent('overdue', {
        sound: 'alarm',
        volume: 0.85,
        repeatMode: 'times_3',
        repeatIntervalSec: 15,
      }),
      presenceOnline: defaultEvent('presenceOnline', { sound: 'soft', volume: 0.4 }),
      presenceCart: defaultEvent('presenceCart', { sound: 'classic', volume: 0.45 }),
      presenceCheckout: defaultEvent('presenceCheckout', { sound: 'restaurant_bell', volume: 0.5 }),
    },
    delay: {
      enabled: true,
      sound: 'classic',
      volume: 0.65,
      customMessage: 'Atenção: pedido perto do atraso',
      warnAtMinutes: [15, 10, 5],
      overdueEnabled: true,
      overdueSound: 'alarm',
      overdueVolume: 0.85,
      overdueMessage: 'Alerta: pedido em atraso',
      repeatMode: 'times_3',
      repeatIntervalSec: 15,
    },
    customSounds: [],
  };
}

function clampVolume(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return 0.7;
  return Math.min(1, Math.max(0, n));
}

function snapMasterVolume(v: unknown): MasterVolumeStep {
  const n = clampVolume(v);
  const steps: MasterVolumeStep[] = [0, 0.25, 0.5, 0.75, 1];
  let best: MasterVolumeStep = 1;
  let bestDist = Infinity;
  for (const s of steps) {
    const d = Math.abs(s - n);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

function isValidSoundId(id: unknown, custom: CustomSound[]): id is SoundId {
  if (typeof id !== 'string' || !id) return false;
  if (id.startsWith('upload:')) {
    const cid = id.slice('upload:'.length);
    return custom.some(c => c.id === cid) || cid.length > 0;
  }
  return SOUND_OPTIONS.some(s => s.id === id);
}

function migrateRepeatMode(e: Partial<EventSoundConfig>): RepeatMode {
  if (e.repeatMode === 'none' || e.repeatMode === 'times_3' || e.repeatMode === 'times_5' || e.repeatMode === 'until_accepted') {
    return e.repeatMode;
  }
  if (e.repeatEnabled === false) return 'none';
  if (e.repeatEnabled === true) return 'until_accepted';
  return 'none';
}

function migrateLegacySound(sound: string): SoundId {
  if (sound === 'doorbell') return 'restaurant_bell';
  if (sound === 'bell') return 'restaurant_bell';
  if (sound === 'notification') return 'classic';
  if (sound === 'custom') return 'voice_female';
  return sound as SoundId;
}

export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  const base = defaultNotificationSettings();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<NotificationSettings> & { version?: number };

  const customSounds = Array.isArray(r.customSounds)
    ? r.customSounds
        .filter((c): c is CustomSound => !!c && typeof c === 'object' && typeof (c as CustomSound).id === 'string' && typeof (c as CustomSound).dataUrl === 'string')
        .map(c => ({
          id: String(c.id).slice(0, 40),
          name: String(c.name || 'Áudio').slice(0, 60),
          mime: String(c.mime || 'audio/mpeg').slice(0, 40),
          dataUrl: String(c.dataUrl).slice(0, 900_000),
          createdAt: String(c.createdAt || new Date().toISOString()),
        }))
        .slice(0, 20)
    : base.customSounds;

  const events = { ...base.events };
  for (const key of Object.keys(events) as NotifEventKey[]) {
    const e = (r.events as Record<string, Partial<EventSoundConfig>> | undefined)?.[key];
    if (!e) continue;
    const rawSound = typeof e.sound === 'string' ? migrateLegacySound(e.sound) : events[key].sound;
    events[key] = {
      ...events[key],
      enabled: e.enabled !== undefined ? !!e.enabled : events[key].enabled,
      sound: isValidSoundId(rawSound, customSounds) ? rawSound : events[key].sound,
      volume: e.volume !== undefined ? clampVolume(e.volume) : events[key].volume,
      customMessage: typeof e.customMessage === 'string' ? e.customMessage.slice(0, 120) : events[key].customMessage,
      repeatEnabled: e.repeatEnabled !== undefined ? !!e.repeatEnabled : events[key].repeatEnabled,
      repeatIntervalSec: ([5, 10, 15, 30] as number[]).includes(Number(e.repeatIntervalSec))
        ? (Number(e.repeatIntervalSec) as RepeatIntervalSec)
        : events[key].repeatIntervalSec,
      repeatMode: key === 'newOrder' || key === 'overdue'
        ? (migrateRepeatMode({ ...events[key], ...e }) || events[key].repeatMode)
        : (e.repeatMode ? migrateRepeatMode(e) : events[key].repeatMode || 'none'),
    };
  }

  // Sync overdue event ↔ delay.overdue* for backward compatibility
  if (!r.events?.overdue && r.delay) {
    events.overdue = {
      ...events.overdue,
      enabled: r.delay.overdueEnabled !== undefined ? !!r.delay.overdueEnabled : events.overdue.enabled,
      sound: (r.delay.overdueSound as SoundId) || events.overdue.sound,
      volume: r.delay.overdueVolume !== undefined ? clampVolume(r.delay.overdueVolume) : events.overdue.volume,
      customMessage: r.delay.overdueMessage || events.overdue.customMessage,
      repeatMode: r.delay.repeatMode || events.overdue.repeatMode,
      repeatIntervalSec: r.delay.repeatIntervalSec || events.overdue.repeatIntervalSec,
    };
  }

  const d = (r.delay || {}) as Partial<DelayWarningConfig>;
  const warnAt = Array.isArray(d.warnAtMinutes)
    ? d.warnAtMinutes.map((n: number) => Number(n)).filter((n: number) => [15, 10, 5].includes(n))
    : base.delay.warnAtMinutes;

  const pushDevices = {
    notebook: r.pushDevices?.notebook !== undefined ? !!r.pushDevices.notebook : base.pushDevices.notebook,
    android: r.pushDevices?.android !== undefined ? !!r.pushDevices.android : base.pushDevices.android,
    tablet: r.pushDevices?.tablet !== undefined ? !!r.pushDevices.tablet : base.pushDevices.tablet,
    pwa: r.pushDevices?.pwa !== undefined ? !!r.pushDevices.pwa : base.pushDevices.pwa,
  };

  const schedule: NotificationSchedule = {
    enabled: r.schedule?.enabled !== undefined ? !!r.schedule.enabled : base.schedule.enabled,
    start: typeof r.schedule?.start === 'string' && /^\d{2}:\d{2}$/.test(r.schedule.start)
      ? r.schedule.start
      : base.schedule.start,
    end: typeof r.schedule?.end === 'string' && /^\d{2}:\d{2}$/.test(r.schedule.end)
      ? r.schedule.end
      : base.schedule.end,
    outsideMode: r.schedule?.outsideMode === 'mute_all' ? 'mute_all' : 'silent_push',
  };

  // Keep delay in sync with overdue event card
  const overdueEv = events.overdue;

  return {
    version: 2,
    masterEnabled: r.masterEnabled !== undefined ? !!r.masterEnabled : base.masterEnabled,
    masterVolume: r.masterVolume !== undefined ? snapMasterVolume(r.masterVolume) : base.masterVolume,
    pushEnabled: r.pushEnabled !== undefined ? !!r.pushEnabled : base.pushEnabled,
    pushDevices,
    schedule,
    smartVoicePrepared: true,
    events,
    delay: {
      ...base.delay,
      enabled: d.enabled !== undefined ? !!d.enabled : base.delay.enabled,
      sound: isValidSoundId(d.sound, customSounds) ? (d.sound as SoundId) : base.delay.sound,
      volume: d.volume !== undefined ? clampVolume(d.volume) : base.delay.volume,
      customMessage: typeof d.customMessage === 'string' ? d.customMessage.slice(0, 120) : base.delay.customMessage,
      warnAtMinutes: warnAt.length ? warnAt : base.delay.warnAtMinutes,
      overdueEnabled: overdueEv.enabled,
      overdueSound: overdueEv.sound,
      overdueVolume: overdueEv.volume,
      overdueMessage: overdueEv.customMessage,
      repeatMode: overdueEv.repeatMode || 'times_3',
      repeatIntervalSec: overdueEv.repeatIntervalSec || 15,
    },
    customSounds,
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
  localStorage.setItem(LEGACY_SOUND_KEY, 'false');
  window.dispatchEvent(new CustomEvent('burger-gn-notif-settings', { detail: normalized }));
}

export function allSoundChoices(settings: NotificationSettings): { id: SoundId; label: string }[] {
  const uploads = settings.customSounds.map(c => ({
    id: `upload:${c.id}` as SoundId,
    label: `📁 ${c.name}`,
  }));
  return [...SOUND_LIBRARY.map(s => ({ id: s.id as SoundId, label: `${s.emoji} ${s.label}` })), ...uploads];
}

/** Minutes since midnight for HH:MM */
function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Whether current local time is inside the notification schedule window. */
export function isWithinNotificationHours(settings: NotificationSettings, now = new Date()): boolean {
  if (!settings.schedule.enabled) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = parseHm(settings.schedule.start);
  const end = parseHm(settings.schedule.end);
  if (start === end) return true;
  if (start < end) return cur >= start && cur < end;
  // overnight window e.g. 22:00 → 06:00
  return cur >= start || cur < end;
}

export type SoundGate = 'play' | 'silent_push' | 'mute';

export function resolveSoundGate(settings: NotificationSettings, now = new Date()): SoundGate {
  if (!settings.masterEnabled) return 'mute';
  if (isWithinNotificationHours(settings, now)) return 'play';
  return settings.schedule.outsideMode === 'mute_all' ? 'mute' : 'silent_push';
}

export function detectDeviceKind(): keyof PushDeviceFlags {
  if (typeof window === 'undefined') return 'notebook';
  const ua = navigator.userAgent || '';
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isStandalone) return 'pwa';
  const isAndroid = /Android/i.test(ua);
  const isTablet =
    /iPad|Tablet/i.test(ua) ||
    (isAndroid && !/Mobile/i.test(ua)) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isTablet) return 'tablet';
  if (isAndroid) return 'android';
  if (/iPhone|iPod|Mobile/i.test(ua)) return 'android'; // treat phones as android push slot
  return 'notebook';
}

export function isPushAllowedOnThisDevice(settings: NotificationSettings): boolean {
  if (!settings.pushEnabled) return false;
  const kind = detectDeviceKind();
  return !!settings.pushDevices[kind];
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

function playRestaurantBell(volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 880, 0, 0.18, volume * 0.45);
  tone(ctx, 1175, 0.16, 0.22, volume * 0.4);
  tone(ctx, 988, 0.36, 0.28, volume * 0.35);
}

function playNewOrder(volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 523, 0, 0.12, volume * 0.4);
  tone(ctx, 659, 0.12, 0.12, volume * 0.4);
  tone(ctx, 784, 0.24, 0.18, volume * 0.45);
  tone(ctx, 1046, 0.42, 0.28, volume * 0.35);
}

function playAlarm(volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  for (let i = 0; i < 4; i++) {
    tone(ctx, 740, i * 0.22, 0.12, volume * 0.5, 'square');
    tone(ctx, 520, i * 0.22 + 0.1, 0.1, volume * 0.4, 'square');
  }
}

function playClassic(volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 660, 0, 0.12, volume * 0.4);
  tone(ctx, 880, 0.12, 0.18, volume * 0.35);
}

function playSoft(volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 440, 0, 0.35, volume * 0.22);
  tone(ctx, 554, 0.15, 0.4, volume * 0.18);
}

function playStrong(volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, 220, 0, 0.2, volume * 0.55, 'sawtooth');
  tone(ctx, 330, 0.15, 0.25, volume * 0.5, 'square');
  tone(ctx, 440, 0.35, 0.3, volume * 0.45, 'sawtooth');
}

function speak(message: string, volume: number, pitch: number) {
  try {
    if (!('speechSynthesis' in window)) {
      playClassic(volume);
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
    playClassic(volume);
  }
}

function playUpload(dataUrl: string, volume: number) {
  try {
    const audio = new Audio(dataUrl);
    audio.volume = clampVolume(volume);
    void audio.play();
  } catch {
    playClassic(volume);
  }
}

export function effectiveVolume(eventVolume: number, masterVolume: number): number {
  return clampVolume(eventVolume) * clampVolume(masterVolume);
}

export function playSoundId(
  sound: SoundId,
  volume: number,
  message?: string,
  opts?: { customSounds?: CustomSound[]; eventKey?: NotifEventKey },
) {
  const v = clampVolume(volume);
  if (typeof sound === 'string' && sound.startsWith('upload:')) {
    const id = sound.slice('upload:'.length);
    const found = (opts?.customSounds || []).find(c => c.id === id);
    if (found) {
      playUpload(found.dataUrl, v);
      return;
    }
    playClassic(v);
    return;
  }

  switch (sound) {
    case 'restaurant_bell':
    case 'doorbell':
    case 'bell':
      playRestaurantBell(v);
      break;
    case 'new_order':
      playNewOrder(v);
      break;
    case 'alarm':
      playAlarm(v);
      break;
    case 'classic':
    case 'notification':
      playClassic(v);
      break;
    case 'soft':
      playSoft(v);
      break;
    case 'strong':
      playStrong(v);
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
    case 'smart_voice': {
      // Prepared for future AI — currently uses local speech with fixed scripts.
      const script =
        (opts?.eventKey && SMART_VOICE_SCRIPTS[opts.eventKey]) ||
        message ||
        'Notificação Burger GN.';
      speak(script, v, 1.05);
      break;
    }
    default:
      playClassic(v);
  }
}

export function playEventSound(
  cfg: EventSoundConfig,
  settings?: NotificationSettings,
  eventKey?: NotifEventKey,
) {
  if (!cfg.enabled) return;
  const master = settings?.masterVolume ?? 1;
  playSoundId(cfg.sound, effectiveVolume(cfg.volume, master), cfg.customMessage, {
    customSounds: settings?.customSounds,
    eventKey,
  });
}

export function playLibrarySound(
  sound: SoundId,
  settings: NotificationSettings,
  message?: string,
) {
  playSoundId(sound, effectiveVolume(0.85, settings.masterVolume), message, {
    customSounds: settings.customSounds,
  });
}

export function getRepeatCount(mode: RepeatMode | undefined): number | 'infinite' | 0 {
  switch (mode) {
    case 'times_3':
      return 3;
    case 'times_5':
      return 5;
    case 'until_accepted':
      return 'infinite';
    case 'none':
    default:
      return 0;
  }
}

export async function requestPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export async function showAdminPush(
  title: string,
  body: string,
  tag?: string,
  settings?: NotificationSettings,
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (settings && !isPushAllowedOnThisDevice(settings)) return;
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

const MAX_CUSTOM_AUDIO_BYTES = 800_000;

export async function fileToCustomSound(file: File): Promise<CustomSound> {
  const name = file.name.toLowerCase();
  const okMime =
    file.type === 'audio/mpeg' ||
    file.type === 'audio/mp3' ||
    file.type === 'audio/wav' ||
    file.type === 'audio/wave' ||
    file.type === 'audio/x-wav' ||
    name.endsWith('.mp3') ||
    name.endsWith('.wav');
  if (!okMime) throw new Error('Envie um arquivo .mp3 ou .wav');
  if (file.size > MAX_CUSTOM_AUDIO_BYTES) {
    throw new Error('Áudio muito grande (máx. ~800 KB). Comprima o arquivo.');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler o áudio'));
    reader.readAsDataURL(file);
  });
  return {
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: file.name.replace(/\.(mp3|wav)$/i, '').slice(0, 60) || 'Meu áudio',
    mime: file.type || (name.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'),
    dataUrl,
    createdAt: new Date().toISOString(),
  };
}
