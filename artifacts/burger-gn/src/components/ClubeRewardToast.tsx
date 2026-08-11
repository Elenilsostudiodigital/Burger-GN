import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type ClubeRewardToastItem = {
  id: string;
  kind: 'cashback' | 'selo';
  title: string;
  subtitle?: string;
};

interface Props {
  items: ClubeRewardToastItem[];
  onDismiss: (id: string) => void;
}

/** Animação discreta ao ganhar cashback ou selo — somente dentro do app. */
export function ClubeRewardToast({ items, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[80] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ClubeRewardToastItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(item.id), 4200);
    return () => window.clearTimeout(t);
  }, [item.id, onDismiss]);

  const emoji = item.kind === 'cashback' ? '💰' : '🍔';
  const accent =
    item.kind === 'cashback'
      ? 'border-emerald-500/40 shadow-emerald-500/10'
      : 'border-amber-500/40 shadow-amber-500/10';

  return (
    <motion.div
      initial={{ opacity: 0, y: -18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`pointer-events-auto w-full max-w-sm rounded-2xl border bg-zinc-950/95 px-4 py-3 shadow-xl backdrop-blur-md ${accent}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <motion.span
          initial={{ scale: 0.6, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 16 }}
          className="text-2xl leading-none"
        >
          {emoji}
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-bold tracking-tight">{item.title}</p>
          {item.subtitle ? (
            <p className="text-zinc-400 text-xs mt-0.5 leading-relaxed">{item.subtitle}</p>
          ) : null}
        </div>
      </div>
      <motion.div
        className={`mt-2.5 h-0.5 rounded-full origin-left ${
          item.kind === 'cashback' ? 'bg-emerald-400/70' : 'bg-amber-400/70'
        }`}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: 4, ease: 'linear' }}
      />
    </motion.div>
  );
}
