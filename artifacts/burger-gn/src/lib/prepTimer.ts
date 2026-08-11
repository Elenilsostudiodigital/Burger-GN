/** Client-side helpers for the intelligent prep countdown. */

export type PrepVisualState = 'ok' | 'warning' | 'overdue' | 'idle';

export function formatCountdown(totalSeconds: number): string {
  const abs = Math.abs(Math.floor(totalSeconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const body = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return totalSeconds < 0 ? `+${body}` : body;
}

export function formatPrepDuration(totalSeconds: number): string {
  const abs = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  if (m <= 0) return `${s}s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${String(s).padStart(2, '0')}s`;
}

export function computePrepRemainingSeconds(opts: {
  prepStartedAt?: string | null;
  prepFinishedAt?: string | null;
  prepTimeMax?: number | null;
  now?: number;
}): number | null {
  if (!opts.prepStartedAt || opts.prepFinishedAt) return null;
  const start = new Date(opts.prepStartedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const maxMin = Math.max(1, Number(opts.prepTimeMax) || 45);
  const deadline = start + maxMin * 60 * 1000;
  const now = opts.now ?? Date.now();
  return Math.ceil((deadline - now) / 1000);
}

export function getPrepVisualState(remainingSeconds: number | null): PrepVisualState {
  if (remainingSeconds == null) return 'idle';
  if (remainingSeconds <= 0) return 'overdue';
  if (remainingSeconds <= 10 * 60) return 'warning';
  return 'ok';
}

export function isPrepEarlyFinish(opts: {
  prepStartedAt?: string | null;
  prepFinishedAt?: string | null;
  prepTimeMax?: number | null;
}): boolean {
  if (!opts.prepStartedAt || !opts.prepFinishedAt) return false;
  const start = new Date(opts.prepStartedAt).getTime();
  const end = new Date(opts.prepFinishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const maxMin = Math.max(1, Number(opts.prepTimeMax) || 45);
  return end < start + maxMin * 60 * 1000;
}
