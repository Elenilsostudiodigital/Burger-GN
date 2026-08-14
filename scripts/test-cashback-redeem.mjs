/**
 * Unit tests for cashback / fidelity utilization helpers (no DB).
 * Run: node scripts/test-cashback-redeem.mjs
 */
import assert from "node:assert/strict";

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function computeCashbackApplicable({ balance, payableTotal, maxUsePercent }) {
  const bal = Math.max(0, roundMoney(balance));
  const payable = Math.max(0, roundMoney(payableTotal));
  if (bal <= 0 || payable <= 0) return 0;
  let cap = payable;
  if (maxUsePercent != null && Number.isFinite(maxUsePercent) && maxUsePercent >= 0) {
    const pctCap = roundMoney(payable * (Math.min(100, maxUsePercent) / 100));
    cap = Math.min(cap, pctCap);
  }
  return Math.min(bal, cap);
}

function resolveBenefitExpiresAt({ mode, days, date, fromMs = Date.now() }) {
  if (mode === "none") return null;
  if (mode === "days") {
    const d = Math.max(1, Math.min(3650, Number(days) || 0));
    if (!d) return null;
    return new Date(fromMs + d * 24 * 60 * 60 * 1000).toISOString();
  }
  const dateStr = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return new Date(`${dateStr}T23:59:59.999-03:00`).toISOString();
}

function daysUntilExpiry(expiresAt, nowMs = Date.now()) {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - nowMs) / (24 * 60 * 60 * 1000));
}

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

// 1) Cliente sem cashback
ok("sem saldo → 0", computeCashbackApplicable({ balance: 0, payableTotal: 72, maxUsePercent: null }) === 0);

// 2) Uso parcial / total
ok(
  "uso total quando saldo < pedido",
  computeCashbackApplicable({ balance: 18.5, payableTotal: 72, maxUsePercent: null }) === 18.5,
);
ok(
  "nunca negativo: saldo > pedido → só o total",
  computeCashbackApplicable({ balance: 55, payableTotal: 30, maxUsePercent: null }) === 30,
);

// 3) Limite percentual
ok(
  "limite 30% em pedido 100 com saldo 80 → 30",
  computeCashbackApplicable({ balance: 80, payableTotal: 100, maxUsePercent: 30 }) === 30,
);
ok(
  "limite 30% com saldo 20 → 20",
  computeCashbackApplicable({ balance: 20, payableTotal: 100, maxUsePercent: 30 }) === 20,
);

// 4) Opt-out (cliente não usa) — applicable ainda calculável, mas uso é 0 no cliente
ok(
  "opt-out: applicable existe mas use=false → total intacto",
  (() => {
    const applicable = computeCashbackApplicable({ balance: 18.5, payableTotal: 72, maxUsePercent: null });
    const use = false;
    const total = Math.max(0, 72 - (use ? applicable : 0));
    return total === 72 && applicable === 18.5;
  })(),
);

// 5) Expiração
{
  const from = Date.parse("2026-01-01T12:00:00.000Z");
  const exp = resolveBenefitExpiresAt({ mode: "days", days: 30, fromMs: from });
  ok("expiry days define data futura", !!exp && Date.parse(exp) > from);
  const fixed = resolveBenefitExpiresAt({ mode: "date", date: "2026-06-01", fromMs: from });
  ok("expiry date específica", !!fixed && Date.parse(fixed) > 0);
  ok("sem validade → null", resolveBenefitExpiresAt({ mode: "none" }) === null);

  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const days = daysUntilExpiry(soon);
  ok("aviso: vence em ~3 dias", days != null && days >= 2 && days <= 4);

  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  ok("expirado: daysUntil < 0", (daysUntilExpiry(past) ?? 0) < 0);
}

// 6) Histórico saldo before/after (simulação de ledger)
{
  const before = 55;
  const used = 30;
  const after = roundMoney(before - used);
  ok("saldo restante após uso parcial", after === 25);
  ok("ledger never negative balance", after >= 0);
}

console.log(`\n${passed} checks passed.`);
