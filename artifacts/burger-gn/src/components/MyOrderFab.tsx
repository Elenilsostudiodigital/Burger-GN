import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getMyOrder, MyOrderRef, archiveMyOrder, markDeliveredPromptStarted,
  DELIVERY_CONFIRM_TIMEOUT_MS,
} from '../lib/myOrder';
import { trackOrder } from '../lib/api';

/** Fixed "Meu Pedido" entry — survives navigation via localStorage. */
export function MyOrderFab() {
  const [location] = useLocation();
  const [myOrder, setMyOrder] = useState<MyOrderRef | null>(() => getMyOrder());

  useEffect(() => {
    const sync = () => setMyOrder(getMyOrder());
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('bgn:my-order-changed', sync as EventListener);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('bgn:my-order-changed', sync as EventListener);
    };
  }, [location]);

  // Background: if delivered and 60s elapsed without answer, archive + hide FAB.
  useEffect(() => {
    if (!myOrder?.trackingId) return;
    let cancelled = false;

    const check = async () => {
      try {
        const order = await trackOrder(myOrder.trackingId);
        if (cancelled) return;
        if (order.status === 'cancelled') {
          archiveMyOrder('manual');
          return;
        }
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
      } catch { /* ignore */ }
    };

    check();
    const id = setInterval(check, 10000);
    return () => { cancelled = true; clearInterval(id); };
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
