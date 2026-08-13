import { useEffect, useRef } from 'react';
import { getOrders, type Order } from '../lib/api';
import {
  LEGACY_SOUND_KEY,
  loadNotificationSettings,
  playEventSound,
  playSoundId,
  showAdminPush,
  workflowToNotifEvent,
  type NotificationSettings,
  type NotifEventKey,
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
    // Avoid double beep with legacy Dashboard toggle (no Dashboard code change).
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

  const fire = async (
    key: NotifEventKey,
    title: string,
    body: string,
    tag?: string,
  ) => {
    const s = settingsRef.current;
    if (!s.masterEnabled) return;
    const cfg = s.events[key];
    if (!cfg?.enabled) return;
    playEventSound(cfg);
    if (s.pushEnabled) {
      await showAdminPush(title, body, tag);
    }
  };

  const startNewOrderRepeat = (order: Order) => {
    const s = settingsRef.current;
    if (!s.masterEnabled) return;
    const cfg = s.events.newOrder;
    if (!cfg.enabled || !cfg.repeatEnabled) return;
    clearRepeat(order.id);
    const intervalSec = cfg.repeatIntervalSec || 10;
    const timer = setInterval(() => {
      const live = settingsRef.current;
      if (!live.masterEnabled || !live.events.newOrder.enabled || !live.events.newOrder.repeatEnabled) {
        clearRepeat(order.id);
        return;
      }
      playEventSound(live.events.newOrder);
      if (live.pushEnabled) {
        void showAdminPush(
          'Novo pedido',
          `#${order.orderNumber} ainda aguarda aceite`,
          `order-repeat-${order.id}`,
        );
      }
    }, intervalSec * 1000);
    repeatingRef.current.set(order.id, timer);
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
        startNewOrderRepeat(order);
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
        // preparing after accept: also play "preparing" if distinct and enabled
        if (key === 'accepted') {
          void fire(
            'accepted',
            'Pedido aceito',
            data.orderNumber ? `#${data.orderNumber} aceito` : 'Pedido aceito',
            data.id ? `order-accepted-${data.id}` : undefined,
          );
          const prep = settingsRef.current.events.preparing;
          if (prep.enabled && settingsRef.current.masterEnabled) {
            setTimeout(() => {
              playEventSound(prep);
            }, 700);
          }
          return;
        }
        const titles: Record<NotifEventKey, string> = {
          newOrder: 'Novo pedido',
          accepted: 'Pedido aceito',
          preparing: 'Em preparo',
          ready: 'Pedido pronto',
          outForDelivery: 'Saiu para entrega',
          delivered: 'Pedido entregue',
        };
        void fire(
          key,
          titles[key],
          data.orderNumber ? `#${data.orderNumber}` : titles[key],
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

  // Delay / overdue polling
  useEffect(() => {
    const tick = async () => {
      const s = settingsRef.current;
      if (!s.masterEnabled || (!s.delay.enabled && !s.delay.overdueEnabled)) return;
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
          if (s.delay.overdueEnabled && !overdueAlertedRef.current.has(order.id)) {
            overdueAlertedRef.current.add(order.id);
            playSoundId(s.delay.overdueSound, s.delay.overdueVolume, s.delay.overdueMessage);
            if (s.pushEnabled) {
              void showAdminPush(
                'Pedido em atraso',
                `#${order.orderNumber} passou do tempo de preparo`,
                `order-overdue-${order.id}`,
              );
            }
          }
          continue;
        }

        if (!s.delay.enabled) continue;
        for (const mark of s.delay.warnAtMinutes) {
          const thresholdSec = mark * 60;
          // Fire once when first crossing the window (poll every ~20s).
          if (remaining > thresholdSec || remaining <= thresholdSec - 75) continue;
          const key = `${order.id}-warn-${mark}`;
          if (warnedRef.current.has(key)) continue;
          warnedRef.current.add(key);
          playSoundId(
            s.delay.sound,
            s.delay.volume,
            `${s.delay.customMessage}. Faltam ${mark} minutos.`,
          );
          if (s.pushEnabled) {
            void showAdminPush(
              'Atenção: atraso próximo',
              `#${order.orderNumber} — faltam ${mark} min`,
              `order-warn-${order.id}-${mark}`,
            );
          }
        }
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 20000);
    return () => clearInterval(id);
  }, []);

  return null;
}
