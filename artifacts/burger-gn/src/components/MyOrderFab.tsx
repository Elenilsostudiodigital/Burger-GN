import React, { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  applyServerOrderToMyOrder,
  archiveMyOrder,
  markDeliveredPromptStarted,
  MY_ORDER_REFRESH_EVENT,
  purgeCustomerOrderTracking,
  DELIVERY_CONFIRM_TIMEOUT_MS,
} from '../lib/myOrder';
import { useVisibleMyOrder } from '../hooks/useMyOrder';
import { trackOrder } from '../lib/api';

/** Fixed "Meu Pedido" entry — only while a real active order exists. */
export function MyOrderFab() {
  const [location] = useLocation();
  const myOrder = useVisibleMyOrder();

  useEffect(() => {
    if (!myOrder?.trackingId) return;
    let cancelled = false;

    const check = async () => {
      try {
        const order = await trackOrder(myOrder.trackingId);
        if (cancelled) return;
        const state = applyServerOrderToMyOrder(order);
        if (state === 'inactive') return;
        if (order.status !== 'done') return;
        if (order.review) {
          archiveMyOrder('reviewed');
          return;
        }
        const promptAt = markDeliveredPromptStarted(order.trackingId)
          || order.deliveredAt
          || new Date().toISOString();
        if (Date.now() - new Date(promptAt).getTime() >= DELIVERY_CONFIRM_TIMEOUT_MS) {
          archiveMyOrder('timeout');
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        if (/not found|não encontrado|404/i.test(message)) {
          purgeCustomerOrderTracking(myOrder.trackingId);
        }
      }
    };

    check();
    const id = setInterval(check, 8000);
    const onRefresh = () => { void check(); };
    window.addEventListener(MY_ORDER_REFRESH_EVENT, onRefresh);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener(MY_ORDER_REFRESH_EVENT, onRefresh);
    };
  }, [myOrder?.trackingId]);

  if (!myOrder) return null;

  if (
    location.startsWith('/admin') ||
    location.startsWith('/checkout') ||
    location === '/confirmacao' ||
    location === '/meu-pedido' ||
    location.startsWith('/pedido/')
  ) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        className="fixed z-[60] right-4 bottom-[5.5rem] sm:bottom-24"
      >
        <Link href="/meu-pedido">
          <button
            type="button"
            className="flex items-center gap-2 pl-3.5 pr-4 py-3 rounded-full bg-amber-500 text-zinc-950 font-black text-sm shadow-[0_10px_30px_rgba(245,158,11,0.45)] border border-amber-300/40 active:scale-95 transition-transform"
          >
            <span className="text-base leading-none" aria-hidden>🍔</span>
            <span className="uppercase tracking-wide">Meu Pedido</span>
            <span className="text-[10px] font-black bg-zinc-950/15 px-1.5 py-0.5 rounded-full">
              #{myOrder.orderNumber}
            </span>
          </button>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}
