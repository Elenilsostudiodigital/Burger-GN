import React, { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  applyServerOrderToMyOrder,
  getMyOrder,
  MY_ORDER_REFRESH_EVENT,
  purgeCustomerOrderTracking,
} from '../lib/myOrder';
import { useVisibleMyOrder } from '../hooks/useMyOrder';
import { trackOrder } from '../lib/api';

/**
 * Floating "Meu Pedido" — visible only for in-progress kitchen/delivery statuses.
 * Always reconciles stored tracking with the server so stale orders cannot keep the tab open.
 */
export function MyOrderFab() {
  const [location] = useLocation();
  const myOrder = useVisibleMyOrder();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const stored = getMyOrder();
      if (!stored?.trackingId) return;
      try {
        const order = await trackOrder(stored.trackingId);
        if (cancelled) return;
        applyServerOrderToMyOrder(order);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        if (/not found|não encontrado|404/i.test(message)) {
          purgeCustomerOrderTracking(stored.trackingId);
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
  }, [location]);

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
