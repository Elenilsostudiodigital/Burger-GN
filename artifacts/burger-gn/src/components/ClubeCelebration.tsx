import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  kind: 'first' | 'returning';
  cashbackLabel?: string;
  onContinue?: () => void;
  continueLabel?: string;
}

/** Lightweight CSS confetti — no new dependency. */
function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        id: i,
        left: `${4 + (i * 3.4) % 92}%`,
        delay: (i % 7) * 0.05,
        duration: 1.6 + (i % 5) * 0.15,
        color: ['#f59e0b', '#34d399', '#f87171', '#60a5fa', '#fbbf24', '#a78bfa'][i % 6],
        rotate: (i * 47) % 360,
        size: 6 + (i % 4) * 2,
      })),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 rounded-sm"
          style={{
            left: p.left,
            width: p.size,
            height: p.size * 1.4,
            backgroundColor: p.color,
          }}
          initial={{ y: -12, opacity: 1, rotate: 0, scale: 1 }}
          animate={{ y: 280, opacity: 0, rotate: p.rotate + 180, scale: 0.7 }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

export function ClubeCelebration({
  kind,
  cashbackLabel,
  onContinue,
  continueLabel = 'Ver meu Clube',
}: Props) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    setShow(true);
  }, [kind]);

  if (!show) return null;

  const isFirst = kind === 'first';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-b from-amber-500/20 via-zinc-950 to-zinc-950 p-6 text-center space-y-4"
    >
      <ConfettiBurst />
      <motion.p
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 14 }}
        className="text-4xl relative"
      >
        🎉
      </motion.p>
      <div className="relative space-y-2">
        <h2 className="text-white font-black text-xl leading-snug">
          {isFirst ? 'Bem-vindo ao Clube Burger GN!' : 'Parabéns!'}
        </h2>
        <p className="text-zinc-300 text-sm">Você acaba de ganhar:</p>
        <div className="space-y-1.5 text-sm font-bold text-left max-w-xs mx-auto">
          <p className="rounded-xl bg-zinc-900/80 border border-zinc-800 px-3 py-2 text-amber-300">
            🍔 {isFirst ? 'Seu primeiro selo.' : '+1 selo de fidelidade.'}
          </p>
          <p className="rounded-xl bg-zinc-900/80 border border-zinc-800 px-3 py-2 text-emerald-300">
            💰 {isFirst
              ? `Seu primeiro cashback${cashbackLabel ? ` (${cashbackLabel})` : '.'}`
              : `Cashback atualizado${cashbackLabel ? ` (${cashbackLabel})` : '.'}`}
          </p>
        </div>
        <p className="text-zinc-500 text-xs leading-relaxed pt-1">
          {isFirst
            ? 'Continue comprando para desbloquear suas próximas recompensas.'
            : 'Continue acumulando para trocar por recompensas.'}
        </p>
      </div>
      {onContinue ? (
        <button
          type="button"
          onClick={onContinue}
          className="relative w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-sm uppercase tracking-wide"
        >
          {continueLabel}
        </button>
      ) : null}
    </motion.div>
  );
}
