/** Persist the customer's active order across navigation and sessions. */

const STORAGE_KEY = 'bgn_my_order';
const HISTORY_KEY = 'bgn_order_history';
const PUSH_QUEUE_KEY = 'bgn_push_queue';
const LAST_ORDER_KEY = 'lastOrder';

export const MY_ORDER_CHANGED_EVENT = 'bgn:my-order-changed';
export const MY_ORDER_REFRESH_EVENT = 'bgn:my-order-refresh';

/**
 * Tab/FAB "Meu Pedido" — only while the kitchen/delivery flow is in progress.
 * Hidden for entregue (done), finalizado and cancelado.
 */
export const MY_ORDER_TAB_WORKFLOWS = [
  'awaiting_payment',
  'new',
  'accepted',
  'preparing',
  'ready',
  'out',
] as const;

const MY_ORDER_TAB_STATUSES = ['new', 'preparing', 'delivery'] as const;

/** Still persisted for the tracking page until finalized/cancelled. */
const PERSISTED_CUSTOMER_WORKFLOWS = [...MY_ORDER_TAB_WORKFLOWS, 'done'] as const;
const PERSISTED_CUSTOMER_STATUSES = [...MY_ORDER_TAB_STATUSES, 'done'] as const;

/** @deprecated use MY_ORDER_TAB_WORKFLOWS / shouldShowMyOrderTab */
export const ACTIVE_CUSTOMER_WORKFLOWS = MY_ORDER_TAB_WORKFLOWS;

export interface MyOrderRef {
  trackingId: string;
  orderNumber: number;
  createdAt: string;
  /** When the client first saw status=done (for 60s auto-close). */
  deliveredPromptAt?: string;
  workflow?: string;
  status?: string;
}

export interface ArchivedOrderRef extends MyOrderRef {
  archivedAt: string;
  reason: 'reviewed' | 'declined' | 'timeout' | 'manual';
}

export type CustomerOrderSnapshot = {
  trackingId?: string;
  orderNumber?: number;
  createdAt?: string;
  status?: string | null;
  workflow?: string | null;
};

function emitMyOrderChanged(detail: MyOrderRef | null) {
  try {
    window.dispatchEvent(new CustomEvent(MY_ORDER_CHANGED_EVENT, { detail }));
  } catch { /* ignore (SSR / tests) */ }
}

export function requestMyOrderRefresh() {
  try {
    window.dispatchEvent(new CustomEvent(MY_ORDER_REFRESH_EVENT));
  } catch { /* ignore */ }
}

export function subscribeMyOrderChanged(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener('storage', handler);
  window.addEventListener(MY_ORDER_CHANGED_EVENT, handler as EventListener);
  window.addEventListener(MY_ORDER_REFRESH_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(MY_ORDER_CHANGED_EVENT, handler as EventListener);
    window.removeEventListener(MY_ORDER_REFRESH_EVENT, handler as EventListener);
  };
}

function workflowOf(order: CustomerOrderSnapshot | null | undefined): string {
  return String(order?.workflow || '').trim();
}

function statusOf(order: CustomerOrderSnapshot | null | undefined): string {
  return String(order?.status || '').trim();
}

export function isCancelledOrFinalized(order: CustomerOrderSnapshot | null | undefined): boolean {
  const workflow = workflowOf(order);
  const status = statusOf(order);
  return status === 'cancelled' || workflow === 'cancelled' || workflow === 'finalized';
}

/** True while tracking data may still be kept (includes entregue until finalized). */
export function isActiveCustomerOrder(order: CustomerOrderSnapshot | null | undefined): boolean {
  if (!order) return false;
  if (isCancelledOrFinalized(order)) return false;
  const workflow = workflowOf(order);
  const status = statusOf(order);
  if (workflow) return (PERSISTED_CUSTOMER_WORKFLOWS as readonly string[]).includes(workflow);
  if (status) return (PERSISTED_CUSTOMER_STATUSES as readonly string[]).includes(status);
  return Boolean(order.trackingId);
}

/**
 * Floating / nav "Meu Pedido" visibility.
 * Requires an explicit in-progress workflow — leftover tracking ids never keep the tab open.
 */
export function shouldShowMyOrderTab(ref: MyOrderRef | CustomerOrderSnapshot | null | undefined = getMyOrder()): boolean {
  if (!ref?.trackingId) return false;
  if (isCancelledOrFinalized(ref)) return false;
  const workflow = workflowOf(ref);
  const status = statusOf(ref);
  if (workflow === 'done' || status === 'done') return false;
  if (workflow) return (MY_ORDER_TAB_WORKFLOWS as readonly string[]).includes(workflow);
  if (status) return (MY_ORDER_TAB_STATUSES as readonly string[]).includes(status);
  return false;
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

export function getVisibleMyOrder(): MyOrderRef | null {
  const ref = getMyOrder();
  return shouldShowMyOrderTab(ref) ? ref : null;
}

export function saveMyOrder(ref: MyOrderRef) {
  if ((ref.workflow || ref.status) && !isActiveCustomerOrder(ref)) {
    purgeCustomerOrderTracking(ref.trackingId);
    return;
  }
  try {
    const prev = getMyOrder();
    const sameOrder = prev?.trackingId === ref.trackingId;
    const next: MyOrderRef = {
      ...ref,
      deliveredPromptAt: sameOrder ? (ref.deliveredPromptAt ?? prev?.deliveredPromptAt) : ref.deliveredPromptAt,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    emitMyOrderChanged(next);
  } catch (err) {
    console.error('[BurgerGN] Failed to persist my order:', err);
  }
}

/** Persist a live server order, or wipe tracking if it is no longer active. */
export function applyServerOrderToMyOrder(order: CustomerOrderSnapshot & {
  trackingId: string;
  orderNumber: number;
  createdAt: string;
}): 'active' | 'inactive' {
  if (!isActiveCustomerOrder(order)) {
    purgeCustomerOrderTracking(order.trackingId);
    return 'inactive';
  }
  saveMyOrder({
    trackingId: order.trackingId,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    workflow: order.workflow ?? undefined,
    status: order.status ?? undefined,
  });
  return 'active';
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
    emitMyOrderChanged(null);
  } catch { /* ignore */ }
}

function removeLastOrderDraft() {
  try {
    sessionStorage.removeItem(LAST_ORDER_KEY);
  } catch { /* ignore */ }
}

function removeTrackingFromList(key: string, trackingId: string) {
  try {
    const prev = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ trackingId?: string }>;
    if (!Array.isArray(prev) || prev.length === 0) return;
    localStorage.setItem(key, JSON.stringify(prev.filter(p => p.trackingId !== trackingId)));
  } catch { /* ignore */ }
}

/** Wipe every customer-side reference to a previous order (tab, draft, history). */
export function purgeCustomerOrderTracking(trackingId?: string) {
  const current = getMyOrder();
  const id = trackingId || current?.trackingId;
  clearMyOrder();
  removeLastOrderDraft();
  try { localStorage.removeItem(LAST_ORDER_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(LAST_ORDER_KEY); } catch { /* ignore */ }
  if (id) {
    removeTrackingFromList(HISTORY_KEY, id);
    removeTrackingFromList(PUSH_QUEUE_KEY, id);
  }
  requestMyOrderRefresh();
}

/**
 * Cart / "voltar ao cardápio": hide the tab unless a real active order is stored.
 * Cart usage alone must never keep "Meu Pedido" visible.
 */
export function hideMyOrderUnlessActive() {
  removeLastOrderDraft();
  const ref = getMyOrder();
  if (!ref) return;
  if (isCancelledOrFinalized(ref) || !isActiveCustomerOrder(ref)) {
    purgeCustomerOrderTracking(ref.trackingId);
    return;
  }
  requestMyOrderRefresh();
}

export function goToCardapio(navigate: (path: string) => void) {
  hideMyOrderUnlessActive();
  navigate('/cardapio');
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
  removeLastOrderDraft();
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
