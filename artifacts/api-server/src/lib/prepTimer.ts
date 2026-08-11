/**
 * Intelligent prep timer helpers — additive; stored in order meta.
 */
import { db, paymentSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decodeGatewayConfig } from "./staticPix";
import type { OrderMeta } from "./orderMeta";

export type PrepTimerPhase = "running" | "warning" | "overdue" | "finished";

export async function loadCompanyPrepTimes(companyId: number): Promise<{
  prepTimeMin: number;
  prepTimeMax: number;
}> {
  const [row] = await db
    .select()
    .from(paymentSettingsTable)
    .where(eq(paymentSettingsTable.companyId, companyId));
  const cfg = decodeGatewayConfig(row?.gatewayProvider);
  return {
    prepTimeMin: cfg.prepTimeMin,
    prepTimeMax: cfg.prepTimeMax,
  };
}

/** Start countdown when order is accepted (→ preparing). Idempotent. */
export function startPrepTimer(
  meta: OrderMeta,
  times: { prepTimeMin: number; prepTimeMax: number },
  at: Date = new Date(),
): OrderMeta {
  if (meta.prepStartedAt) return meta;
  return {
    ...meta,
    prepStartedAt: at.toISOString(),
    prepTimeMin: times.prepTimeMin,
    prepTimeMax: times.prepTimeMax,
  };
}

/** Stop countdown when order becomes ready (or later kitchen stages). Idempotent. */
export function finishPrepTimer(meta: OrderMeta, at: Date = new Date()): OrderMeta {
  if (!meta.prepStartedAt || meta.prepFinishedAt) return meta;
  return {
    ...meta,
    prepFinishedAt: at.toISOString(),
  };
}

export function prepDurationSeconds(meta: OrderMeta): number | null {
  if (!meta.prepStartedAt) return null;
  const start = new Date(meta.prepStartedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const end = meta.prepFinishedAt
    ? new Date(meta.prepFinishedAt).getTime()
    : Date.now();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function prepDeadlineMs(meta: OrderMeta): number | null {
  if (!meta.prepStartedAt) return null;
  const start = new Date(meta.prepStartedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const maxMin = Math.max(1, Number(meta.prepTimeMax) || 45);
  return start + maxMin * 60 * 1000;
}

export function prepRemainingSeconds(meta: OrderMeta, now: Date = new Date()): number | null {
  if (!meta.prepStartedAt || meta.prepFinishedAt) return null;
  const deadline = prepDeadlineMs(meta);
  if (deadline == null) return null;
  return Math.ceil((deadline - now.getTime()) / 1000);
}

export function isPrepEarlyFinish(meta: OrderMeta): boolean {
  if (!meta.prepStartedAt || !meta.prepFinishedAt) return false;
  const deadline = prepDeadlineMs(meta);
  if (deadline == null) return false;
  const finished = new Date(meta.prepFinishedAt).getTime();
  return Number.isFinite(finished) && finished < deadline;
}

export function isPrepLateFinish(meta: OrderMeta): boolean {
  if (!meta.prepStartedAt || !meta.prepFinishedAt) return false;
  const deadline = prepDeadlineMs(meta);
  if (deadline == null) return false;
  const finished = new Date(meta.prepFinishedAt).getTime();
  return Number.isFinite(finished) && finished > deadline;
}

export interface PrepDayStats {
  date: string;
  averagePrepMinutes: number | null;
  onTimeCount: number;
  lateCount: number;
  finishedCount: number;
  inProgressCount: number;
}

export function computePrepDayStats(
  metas: OrderMeta[],
  now: Date = new Date(),
): PrepDayStats {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dayStart = new Date(y, m, d).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  let finishedOnTime = 0;
  let finishedLate = 0;
  let overdueInProgress = 0;
  let inProgressCount = 0;
  const durations: number[] = [];

  for (const meta of metas) {
    if (!meta.prepStartedAt) continue;
    const start = new Date(meta.prepStartedAt).getTime();
    if (!Number.isFinite(start) || start < dayStart || start >= dayEnd) continue;

    if (meta.prepFinishedAt) {
      const secs = prepDurationSeconds(meta);
      if (secs != null) durations.push(secs);
      if (isPrepLateFinish(meta)) finishedLate += 1;
      else finishedOnTime += 1;
    } else {
      inProgressCount += 1;
      const remaining = prepRemainingSeconds(meta, now);
      if (remaining != null && remaining <= 0) overdueInProgress += 1;
    }
  }

  const avg =
    durations.length > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length / 60) * 10) / 10
      : null;

  return {
    date: new Date(dayStart).toISOString().slice(0, 10),
    averagePrepMinutes: avg,
    onTimeCount: finishedOnTime,
    lateCount: finishedLate + overdueInProgress,
    finishedCount: finishedOnTime + finishedLate,
    inProgressCount,
  };
}
