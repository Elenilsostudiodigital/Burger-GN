import { useEffect, useRef } from 'react';
import { getOrders, type Order } from '../lib/api';
import {
  LEGACY_SOUND_KEY,
  getRepeatCount,
  loadNotificationSettings,
  playEventSound,
  playSoundId,
  resolveSoundGate,
  showAdminPush,
  workflowToNotifEvent,
  type NotificationSettings,
  type NotifEventKey,
  effectiveVolume,
} from '../lib/adminNotifications';
import { computePrepRemainingSeconds } from '../lib/prepTimer';

/**
 * Runs on every protected admin page.
 * Owns configurable sounds + browser/PWA notifications from SSE —
 * without modifying the Dashboard module.
 */
export function AdminNotificationEngine() {
  const settingsRef = useRef<NotificationSettings>(loadNotificationSettings());
  const repeatingRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());
  const warnedRef = useRef<Set<string>>(new Set());
  const overdueAlertedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const onSettings = (e: Event) => {
      const detail = (e as CustomEvent<NotificationSettings>).detail;
      if (detail) settingsRef.current = detail;
      else settingsRef.current = loadNotificationSettings();
    };
    window.addEventListener('burger-gn-notif-settings', onSettings);
    settingsRef.current = loadNotificationSettings();
    if (settingsRef.current.masterEnabled) {
      try { localStorage.setItem(LEGACY_SOUND_KEY, 'false'); } catch { /* ignore */ }
    }
    return () => window.removeEventListener('burger-gn-notif-settings', onSettings);
  }, []);

  const clearRepeat = (orderId: number) => {
    const t = repeatingRef.current.get(orderId);
    if (t) clearInterval(t);
    repeatingRef.current.delete(orderId);
  };

  const clearAllRepeats = () => {
    for (const id of [...repeatingRef.current.keys()]) clearRepeat(id);
  };

  const maybePush = async (title: string, body: string, tag?: string) => {
    const s = settingsRef.current;
    const gate = resolveSoundGate(s);
    if (gate === 'mute') return;
    await showAdminPush(title, body, tag, s);
  };

  const fire = async (
    key: NotifEventKey,
    title: string,
    body: string,
    tag?: string,
  ) => {
    const s = settingsRef.current;
    const gate = resolveSoundGate(s);
    if (gate === 'mute') return;
    const cfg = s.events[key];
    if (!cfg?.enabled) return;
    if (gate === 'play') {
      playEventSound(cfg, s, key);
    }
    await maybePush(title, body, tag);
  };

  const startRepeat = (
    orderId: number,
    orderNumber: number,
    eventKey: NotifEventKey,
  ) => {
    const s = settingsRef.current;
    const cfg = s.events[eventKey];
    if (!cfg?.enabled) return;
    const mode = cfg.repeatMode || (cfg.repeatEnabled ? 'until_accepted' : 'none');
    const total = getRepeatCount(mode);
    if (total === 0) return;

    clearRepeat(orderId);
    const intervalSec = cfg.repeatIntervalSec || 10;
    // First play already happened in fire(); schedule remaining plays.
    let played = 1;

    const timer = setInterval(() => {
      const live = settingsRef.current;
      const gate = resolveSoundGate(live);
      const liveCfg = live.events[eventKey];
      if (!live.masterEnabled || !liveCfg?.enabled) {
        clearRepeat(orderId);
        return;
      }
      const liveMode = liveCfg.repeatMode || 'none';
      const liveTotal = getRepeatCount(liveMode);
      if (liveTotal === 0) {
        clearRepeat(orderId);
        return;
      }

      played += 1;
      if (gate === 'play') {
        playEventSound(liveCfg, live, eventKey);
      }
      if (gate !== 'mute') {
        void showAdminPush(
          EVENT_TITLE[eventKey],
          `#${orderNumber} — repetição`,
          `order-repeat-${eventKey}-${orderId}`,
          live,
        );
      }

      if (liveTotal !== 'infinite' && played >= liveTotal) {
        clearRepeat(orderId);
      }
    }, intervalSec * 1000);

    repeatingRef.current.set(orderId, timer);
  };

  useEffect(() => {
    const es = new EventSource('/api/orders/stream', { withCredentials: true });

    es.addEventListener('new_order', (e) => {
      try {
        const order = JSON.parse((e as MessageEvent).data) as Order;
        void fire(
          'newOrder',
          'Novo pedido',
          `#${order.orderNumber} — ${order.customerName || 'Cliente'}`,
          `order-new-${order.id}`,
        );
        startRepeat(order.id, order.orderNumber, 'newOrder');
      } catch { /* ignore */ }
    });

    es.addEventListener('order_status', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          id?: number;
          orderNumber?: number;
          workflow?: string;
        };
        if (typeof data.id === 'number') clearRepeat(data.id);
        const key = workflowToNotifEvent(data.workflow);
        if (!key || key === 'newOrder') return;

        if (key === 'accepted') {
          void fire(
            'accepted',
            'Pedido aceito',
            data.orderNumber ? `#${data.orderNumber} aceito` : 'Pedido aceito',
            data.id ? `order-accepted-${data.id}` : undefined,
          );
          const prep = settingsRef.current.events.preparing;
          const gate = resolveSoundGate(settingsRef.current);
          if (prep.enabled && gate === 'play') {
            setTimeout(() => playEventSound(prep, settingsRef.current, 'preparing'), 700);
          } else if (prep.enabled && gate === 'silent_push') {
            void maybePush('Em preparo', data.orderNumber ? `#${data.orderNumber}` : 'Em preparo');
          }
          return;
        }

        void fire(
          key,
          EVENT_TITLE[key],
          data.orderNumber ? `#${data.orderNumber}` : EVENT_TITLE[key],
          data.id ? `order-${key}-${data.id}` : undefined,
        );
      } catch { /* ignore */ }
    });

    return () => {
      es.close();
      clearAllRepeats();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = async () => {
      const s = settingsRef.current;
      if (!s.masterEnabled || (!s.delay.enabled && !s.events.overdue.enabled && !s.delay.overdueEnabled)) {
        return;
      }
      let orders: Order[] = [];
      try {
        orders = await getOrders();
      } catch {
        return;
      }
      for (const order of orders) {
        if (order.workflow !== 'preparing' && order.status !== 'preparing') continue;
        if (order.prepFinishedAt) continue;
        const remaining = computePrepRemainingSeconds({
          prepStartedAt: order.prepStartedAt,
          prepFinishedAt: order.prepFinishedAt,
          prepTimeMax: order.prepTimeMax,
        });
        if (remaining == null) continue;

        if (remaining <= 0) {
          const overdueCfg = s.events.overdue;
          const overdueOn = overdueCfg.enabled || s.delay.overdueEnabled;
          if (overdueOn && !overdueAlertedRef.current.has(order.id)) {
            overdueAlertedRef.current.add(order.id);
            const gate = resolveSoundGate(s);
            if (gate === 'play') {
              playEventSound(
                {
                  ...overdueCfg,
                  enabled: true,
                  sound: overdueCfg.sound || s.delay.overdueSound,
                  volume: overdueCfg.volume || s.delay.overdueVolume,
                  customMessage: overdueCfg.customMessage || s.delay.overdueMessage,
                },
                s,
                'overdue',
              );
            }
            if (gate !== 'mute') {
              void showAdminPush(
                'Pedido em atraso',
                `#${order.orderNumber} passou do tempo de preparo`,
                `order-overdue-${order.id}`,
                s,
              );
            }
            startRepeat(order.id, order.orderNumber, 'overdue');
          }
          continue;
        }

        if (!s.delay.enabled) continue;
        for (const mark of s.delay.warnAtMinutes) {
          const thresholdSec = mark * 60;
          if (remaining > thresholdSec || remaining <= thresholdSec - 75) continue;
          const key = `${order.id}-warn-${mark}`;
          if (warnedRef.current.has(key)) continue;
          warnedRef.current.add(key);
          const gate = resolveSoundGate(s);
          if (gate === 'play') {
            playSoundId(
              s.delay.sound,
              effectiveVolume(s.delay.volume, s.masterVolume),
              `${s.delay.customMessage}. Faltam ${mark} minutos.`,
              { customSounds: s.customSounds },
            );
          }
          if (gate !== 'mute') {
            void showAdminPush(
              'Atenção: atraso próximo',
              `#${order.orderNumber} — faltam ${mark} min`,
              `order-warn-${order.id}-${mark}`,
              s,
            );
          }
        }
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

const EVENT_TITLE: Record<NotifEventKey, string> = {
  newOrder: 'Novo pedido',
  accepted: 'Pedido aceito',
  preparing: 'Em preparo',
  ready: 'Pedido pronto',
  outForDelivery: 'Saiu para entrega',
  delivered: 'Pedido entregue',
  overdue: 'Pedido em atraso',
};
