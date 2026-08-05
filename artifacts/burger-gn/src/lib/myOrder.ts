/** Persist the customer's active order across navigation and sessions. */

const STORAGE_KEY = 'bgn_my_order';
const PUSH_QUEUE_KEY = 'bgn_push_queue';

export interface MyOrderRef {
  trackingId: string;
  orderNumber: number;
  createdAt: string;
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ref));
    window.dispatchEvent(new CustomEvent('bgn:my-order-changed', { detail: ref }));
  } catch (err) {
    console.error('[BurgerGN] Failed to persist my order:', err);
  }
}

export function clearMyOrder() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('bgn:my-order-changed', { detail: null }));
  } catch { /* ignore */ }
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
