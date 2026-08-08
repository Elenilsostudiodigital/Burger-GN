import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Store } from 'lucide-react';
import { getStoreHours, StoreHours } from '../lib/api';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function useStoreOpen() {
  const [hours, setHours] = useState<StoreHours | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStoreHours()
      .then(setHours)
      .catch(() => setHours(null))
      .finally(() => setLoading(false));
  }, []);

  return {
    hours,
    loading,
    isOpen: hours?.isOpen !== false,
    canOrder: hours ? !!hours.isOpen : true,
  };
}

export function StoreClosedBanner({ compact = false }: { compact?: boolean }) {
  const { hours, canOrder } = useStoreOpen();

  if (!hours || canOrder) return null;

  const days = (hours.days || [])
    .slice()
    .sort()
    .map((d) => DAY_LABELS[d] || '')
    .filter(Boolean)
    .join(' · ');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className={compact
          ? 'mx-4 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5'
          : 'mx-auto max-w-md px-4 pt-3'}
      >
        <div className={compact ? '' : 'rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-zinc-900/80 px-4 py-3.5'}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Store size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-amber-400 font-black text-sm uppercase tracking-wide">
                Loja fechada no momento
              </p>
              <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
                Você pode navegar no cardápio normalmente. Novos pedidos serão liberados
                quando a hamburgueria abrir.
              </p>
              <p className="text-zinc-500 text-[11px] mt-1.5 flex items-center gap-1.5">
                <Clock size={12} />
                {hours.openTime} – {hours.closeTime}
                {days ? ` · ${days}` : ''}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
