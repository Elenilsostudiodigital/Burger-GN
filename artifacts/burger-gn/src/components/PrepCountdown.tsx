import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  computePrepRemainingSeconds,
  formatCountdown,
  formatPrepDuration,
  getPrepVisualState,
  PrepVisualState,
} from '../lib/prepTimer';

interface Props {
  prepStartedAt?: string | null;
  prepFinishedAt?: string | null;
  prepTimeMax?: number | null;
  prepDurationSeconds?: number | null;
  /** Kitchen alerts (warning/overdue copy). Off for customer view. */
  showKitchenAlerts?: boolean;
  compact?: boolean;
}

const STATE_STYLES: Record<PrepVisualState, string> = {
  ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-400/50 bg-amber-500/10 text-amber-200',
  overdue: 'border-red-500/50 bg-red-500/10 text-red-300',
  idle: 'border-zinc-800 bg-zinc-950 text-zinc-400',
};

export function PrepCountdown({
  prepStartedAt,
  prepFinishedAt,
  prepTimeMax,
  prepDurationSeconds,
  showKitchenAlerts = false,
  compact = false,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!prepStartedAt || prepFinishedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [prepStartedAt, prepFinishedAt]);

  if (!prepStartedAt) return null;

  if (prepFinishedAt) {
    const duration =
      typeof prepDurationSeconds === 'number'
        ? prepDurationSeconds
        : Math.max(
            0,
            Math.floor(
              (new Date(prepFinishedAt).getTime() - new Date(prepStartedAt).getTime()) / 1000,
            ),
          );
    return (
      <div className={`rounded-xl border px-3 py-2 ${STATE_STYLES.idle}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Tempo total de preparo
        </p>
        <p className="font-black text-sm text-white mt-0.5">{formatPrepDuration(duration)}</p>
      </div>
    );
  }

  const remaining = computePrepRemainingSeconds({
    prepStartedAt,
    prepFinishedAt,
    prepTimeMax,
    now,
  });
  const state = getPrepVisualState(remaining);
  if (remaining == null) return null;

  return (
    <motion.div
      layout
      className={`rounded-xl border px-3 py-2 ${STATE_STYLES[state]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          {state === 'overdue' ? '⏱ Atraso' : '⏱ Tempo restante'}
        </p>
        <p className={`font-black tabular-nums ${compact ? 'text-base' : 'text-xl'} leading-none`}>
          {formatCountdown(remaining)}
        </p>
      </div>
      {showKitchenAlerts && state === 'warning' && (
        <p className="text-[11px] mt-1.5 leading-snug opacity-95">
          ⚠ Atenção! Faltam apenas 10 minutos para atingir o tempo máximo estimado.
        </p>
      )}
      {showKitchenAlerts && state === 'overdue' && (
        <p className="text-[11px] mt-1.5 leading-snug opacity-95">
          Pedido em atraso. Priorize este atendimento.
        </p>
      )}
      {showKitchenAlerts && state === 'ok' && (
        <p className="text-[11px] mt-1.5 leading-snug opacity-80">🟢 Dentro do prazo</p>
      )}
    </motion.div>
  );
}

/** Card border accent for kitchen board based on countdown state. */
export function prepCardBorderClass(state: PrepVisualState, highlight: boolean): string {
  if (highlight) return 'border-amber-500 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.25)]';
  if (state === 'overdue') return 'border-red-500/70 bg-red-500/5 shadow-[0_0_18px_rgba(239,68,68,0.2)]';
  if (state === 'warning') return 'border-amber-400/70 bg-amber-500/5 shadow-[0_0_16px_rgba(245,158,11,0.18)]';
  if (state === 'ok') return 'border-emerald-500/40 bg-zinc-900';
  return 'border-zinc-800 bg-zinc-900';
}
