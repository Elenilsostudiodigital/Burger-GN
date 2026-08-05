/** Persist the customer's active order across navigation and sessions. */

const STORAGE_KEY = 'bgn_my_order';
const HISTORY_KEY = 'bgn_order_history';
const PUSH_QUEUE_KEY = 'bgn_push_queue';

export interface MyOrderRef {
  trackingId: string;
  orderNumber: number;
  createdAt: string;
  /** When the client first saw status=done (for 60s auto-close). */
  deliveredPromptAt?: string;
}

export interface ArchivedOrderRef extends MyOrderRef {
  archivedAt: string;
  reason: 'reviewed' | 'declined' | 'timeout' | 'manual';
}

export function getMyOrder(): MyOrderRef | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MyOrderRef;
    if (!parsed?.trackingId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMyOrder(ref: MyOrderRef) {
  try {
    const prev = getMyOrder();
    const next: MyOrderRef = {
      ...ref,
      deliveredPromptAt: ref.deliveredPromptAt ?? prev?.deliveredPromptAt,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('bgn:my-order-changed', { detail: next }));
  } catch (err) {
    console.error('[BurgerGN] Failed to persist my order:', err);
  }
}

export function markDeliveredPromptStarted(trackingId: string) {
  const current = getMyOrder();
  if (!current || current.trackingId !== trackingId) return current?.deliveredPromptAt ?? null;
  if (current.deliveredPromptAt) return current.deliveredPromptAt;
  const at = new Date().toISOString();
  saveMyOrder({ ...current, deliveredPromptAt: at });
  return at;
}

export function clearMyOrder() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('bgn:my-order-changed', { detail: null }));
  } catch { /* ignore */ }
}

/** Archive active order for history and remove Meu Pedido FAB. */
export function archiveMyOrder(reason: ArchivedOrderRef['reason']) {
  const current = getMyOrder();
  if (!current) return;
  try {
    const prev = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as ArchivedOrderRef[];
    const entry: ArchivedOrderRef = {
      ...current,
      archivedAt: new Date().toISOString(),
      reason,
    };
    const next = [entry, ...prev.filter(p => p.trackingId !== current.trackingId)].slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  clearMyOrder();
}

export function getOrderHistory(): ArchivedOrderRef[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as ArchivedOrderRef[];
  } catch {
    return [];
  }
}

/** Structure prepared for future Web Push / FCM — not integrated yet. */
export interface PendingPushNotification {
  type: 'order_status';
  trackingId: string;
  workflow: string;
  title: string;
  body: string;
  at: string;
}

export function queuePushNotification(event: Omit<PendingPushNotification, 'at'>) {
  try {
    const prev = JSON.parse(localStorage.getItem(PUSH_QUEUE_KEY) || '[]') as PendingPushNotification[];
    const next = [...prev, { ...event, at: new Date().toISOString() }].slice(-30);
    localStorage.setItem(PUSH_QUEUE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function isPushIntegrated(): boolean {
  return false;
}

export const DELIVERY_CONFIRM_TIMEOUT_MS = 60_000;
