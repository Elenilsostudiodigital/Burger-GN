import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { customerInAppStatusMessage, getCustomerActiveOrder, type Order } from '../lib/api';
import { getSavedClubePhone } from '../lib/clubeCliente';
import {
  applyServerOrderToMyOrder,
  getMyOrder,
  isActiveCustomerOrder,
  requestMyOrderRefresh,
  shouldShowMyOrderTab,
} from '../lib/myOrder';
import { notifyOrderStatusChange } from '../lib/pushNotifications';

function digitsPhone(): string {
  return getSavedClubePhone().replace(/\D/g, '');
}

function adoptRemoteOrder(order: Order, opts?: { notify?: boolean }) {
  const prev = getMyOrder();
  const isNew = prev?.trackingId !== order.trackingId;
  applyServerOrderToMyOrder(order);
  if (opts?.notify !== false && isNew && shouldShowMyOrderTab(order)) {
    const wf = String(order.workflow || order.status || 'new');
    const msg = customerInAppStatusMessage(wf, {
      paymentStatus: order.paymentStatus,
      rejectReason: order.rejectReason,
      receiptRejectReason: order.receiptRejectReason,
    });
    notifyOrderStatusChange({
      trackingId: order.trackingId,
      workflow: wf,
      title: `Pedido #${order.orderNumber} — ${msg.title}`,
      body: msg.body,
    });
  }
}

/**
 * Registered customers: pick up attendant-created orders while the PWA is open.
 * Closed-app push stays queued via notifyOrderStatusChange (not wired to FCM yet).
 */
export function useCustomerOrderSync() {
  const [location] = useLocation();

  useEffect(() => {
    if (location.startsWith('/admin')) return undefined;

    let cancelled = false;
    let es: EventSource | null = null;
    let lastFingerprint = '';

    const fingerprintOf = (order: Order) =>
      [
        order.trackingId,
        order.workflow,
        order.status,
        order.paymentStatus,
        order.updatedAt || '',
        order.itemsUpdatedAt || '',
        order.total,
        (order.items || []).map((i) => `${i.quantity}x${i.productName}`).join('|'),
      ].join(':');

    const pull = async () => {
      const phone = digitsPhone();
      if (phone.length < 10) return;
      try {
        const result = await getCustomerActiveOrder(phone);
        if (cancelled) return;
        if (!result.found || !result.order) return;
        const remote = result.order;
        const stored = getMyOrder();
        if (!stored) {
          lastFingerprint = fingerprintOf(remote);
          adoptRemoteOrder(remote);
          return;
        }
        if (stored.trackingId === remote.trackingId) {
          const fp = fingerprintOf(remote);
          applyServerOrderToMyOrder(remote);
          if (fp !== lastFingerprint) {
            lastFingerprint = fp;
            requestMyOrderRefresh();
          }
          return;
        }
        const storedActive = isActiveCustomerOrder(stored);
        const remoteNewer = new Date(remote.createdAt).getTime() >= new Date(stored.createdAt || 0).getTime();
        if (!storedActive || remoteNewer) {
          lastFingerprint = fingerprintOf(remote);
          adoptRemoteOrder(remote);
        }
      } catch {
        /* ignore — polling retries */
      }
    };

    const connect = () => {
      const phone = digitsPhone();
      if (phone.length < 10) return;
      if (es) {
        es.close();
        es = null;
      }
      es = new EventSource(`/api/orders/customer-stream?phone=${encodeURIComponent(phone)}`);
      es.addEventListener('counter_order', (e) => {
        try {
          const order = JSON.parse((e as MessageEvent).data) as Order;
          if (order?.trackingId) {
            lastFingerprint = fingerprintOf(order);
            adoptRemoteOrder(order);
          }
        } catch { /* ignore */ }
      });
      es.addEventListener('order_updated', (e) => {
        try {
          const order = JSON.parse((e as MessageEvent).data) as Order;
          if (!order?.trackingId) return;
          const stored = getMyOrder();
          if (stored?.trackingId === order.trackingId || !stored) {
            lastFingerprint = fingerprintOf(order);
            applyServerOrderToMyOrder(order);
            requestMyOrderRefresh();
          }
        } catch { /* ignore */ }
      });
      es.addEventListener('order_status', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { trackingId?: string };
          if (data?.trackingId) void pull();
          requestMyOrderRefresh();
        } catch { /* ignore */ }
      });
    };

    void pull();
    connect();
    const interval = window.setInterval(() => { void pull(); }, 4000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void pull();
    };
    const onSession = () => {
      connect();
      void pull();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('bgn:clube-session-changed', onSession);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('bgn:clube-session-changed', onSession);
    };
  }, [location]);
}
