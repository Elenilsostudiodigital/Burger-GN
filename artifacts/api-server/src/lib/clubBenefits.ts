/**
 * Cashback / fidelity utilization helpers — all money math stays server-side.
 */
import {
  appendClientLedger,
  type ClientMeta,
} from "./clientMeta";

export type BenefitExpiryMode = "none" | "days" | "date";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseExpiryMode(raw: unknown): BenefitExpiryMode {
  if (raw === "days" || raw === "date") return raw;
  return "none";
}

/** Resolve absolute expiry ISO from settings + reference time. */
export function resolveBenefitExpiresAt(opts: {
  mode: BenefitExpiryMode;
  days?: number | null;
  date?: string | null;
  fromMs?: number;
}): string | null {
  const from = opts.fromMs ?? Date.now();
  if (opts.mode === "none") return null;
  if (opts.mode === "days") {
    const days = Math.max(1, Math.min(3650, Number(opts.days) || 0));
    if (!days) return null;
    return new Date(from + days * 24 * 60 * 60 * 1000).toISOString();
  }
  const dateStr = String(opts.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  // End of day America/Sao_Paulo (−03)
  return new Date(`${dateStr}T23:59:59.999-03:00`).toISOString();
}

/**
 * Max cashback that may be applied on an order.
 * Never exceeds balance, payable total, or admin % cap. Never negative.
 */
export function computeCashbackApplicable(opts: {
  balance: number;
  payableTotal: number;
  maxUsePercent?: number | null;
}): number {
  const balance = Math.max(0, roundMoney(opts.balance));
  const payable = Math.max(0, roundMoney(opts.payableTotal));
  if (balance <= 0 || payable <= 0) return 0;

  let cap = payable;
  const pct = opts.maxUsePercent;
  if (pct != null && Number.isFinite(pct) && pct >= 0) {
    const pctCap = roundMoney(payable * (Math.min(100, pct) / 100));
    cap = Math.min(cap, pctCap);
  }
  return Math.min(balance, cap);
}

export function daysUntilExpiry(expiresAt: string | null | undefined, nowMs = Date.now()): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - nowMs) / (24 * 60 * 60 * 1000));
}

export function buildExpiryWarning(
  expiresAt: string | null | undefined,
  warningDays = 7,
  nowMs = Date.now(),
): { active: boolean; daysLeft: number; message: string } | null {
  const daysLeft = daysUntilExpiry(expiresAt, nowMs);
  if (daysLeft == null) return null;
  if (daysLeft < 0) return null;
  const warnWithin = Math.max(1, Math.min(90, warningDays || 7));
  if (daysLeft > warnWithin) return null;
  return {
    active: true,
    daysLeft,
    message:
      daysLeft === 0
        ? "Seu benefício vence hoje. Utilize antes de perder."
        : `Seu benefício vence em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}. Utilize antes de perder.`,
  };
}

/** Zero cashback balance when past expiry; append ledger once. */
export function applyLazyCashbackExpiry(opts: {
  balance: number;
  meta: ClientMeta;
  nowMs?: number;
}): { balance: number; meta: ClientMeta; expiredAmount: number; changed: boolean } {
  const nowMs = opts.nowMs ?? Date.now();
  const expiresAt = opts.meta.cashbackExpiresAt;
  if (!expiresAt) {
    return { balance: opts.balance, meta: opts.meta, expiredAmount: 0, changed: false };
  }
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t) || t > nowMs) {
    return { balance: opts.balance, meta: opts.meta, expiredAmount: 0, changed: false };
  }

  const balance = Math.max(0, roundMoney(opts.balance));
  if (balance <= 0) {
    const nextMeta: ClientMeta = { ...opts.meta, cashbackExpiresAt: null };
    return { balance: 0, meta: nextMeta, expiredAmount: 0, changed: nextMeta.cashbackExpiresAt !== opts.meta.cashbackExpiresAt };
  }

  const before = balance;
  let meta = appendClientLedger(opts.meta, {
    at: new Date(nowMs).toISOString(),
    type: "cashback_expirado",
    cashbackDelta: -before,
    balanceBefore: before,
    balanceAfter: 0,
    description: "Cashback expirado automaticamente",
  });
  meta = { ...meta, cashbackExpiresAt: null };
  return { balance: 0, meta, expiredAmount: before, changed: true };
}

/** Zero fidelity stamps when past expiry; append ledger once. */
export function applyLazyFidelityExpiry(opts: {
  stamps: number;
  meta: ClientMeta;
  nowMs?: number;
}): { stamps: number; meta: ClientMeta; expiredStamps: number; changed: boolean } {
  const nowMs = opts.nowMs ?? Date.now();
  const expiresAt = opts.meta.fidelityExpiresAt;
  if (!expiresAt) {
    return { stamps: opts.stamps, meta: opts.meta, expiredStamps: 0, changed: false };
  }
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t) || t > nowMs) {
    return { stamps: opts.stamps, meta: opts.meta, expiredStamps: 0, changed: false };
  }

  const stamps = Math.max(0, Math.floor(opts.stamps));
  if (stamps <= 0) {
    const nextMeta: ClientMeta = { ...opts.meta, fidelityExpiresAt: null };
    return {
      stamps: 0,
      meta: nextMeta,
      expiredStamps: 0,
      changed: nextMeta.fidelityExpiresAt !== opts.meta.fidelityExpiresAt,
    };
  }

  let meta = appendClientLedger(opts.meta, {
    at: new Date(nowMs).toISOString(),
    type: "fidelity_expirada",
    stampsDelta: -stamps,
    description: "Selos de fidelidade expirados automaticamente",
  });
  meta = { ...meta, fidelityExpiresAt: null };
  return { stamps: 0, meta, expiredStamps: stamps, changed: true };
}

export function readMaxUsePercent(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = parseFloat(String(raw));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(100, n);
}
