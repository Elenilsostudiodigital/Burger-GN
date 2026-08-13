/**
 * Eligibility + pure reward simulation for cashback / fidelity.
 * Run: node scripts/order-rewards-selftest.mjs
 */

const FIDELITY_TZ = "America/Sao_Paulo";

function isEligibleForOrderRewards(order) {
  if (order.status !== "done") return false;
  if (order.paymentMethod === "pix" && order.paymentStatus !== "paid") return false;
  return true;
}

function calendarDateSP(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FIDELITY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function hasFidelityStampOnCalendarDay(meta, dayIso) {
  return (meta.ledger ?? []).some((entry) => {
    if (entry.type !== "selo_pedido" || !entry.at) return false;
    const at = Date.parse(entry.at);
    return Number.isFinite(at) && calendarDateSP(at) === dayIso;
  });
}

function canAwardFidelityStamp(meta, nowMs) {
  return !hasFidelityStampOnCalendarDay(meta, calendarDateSP(nowMs));
}

function hasLedgerForOrder(meta, orderId, type) {
  return (meta.ledger ?? []).some((e) => e.orderId === orderId && e.type === type);
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Pure simulation mirroring applyOrderCompletionRewards award rules
 * (no DB). Admin base = starting points/cashbackBalance.
 */
function simulateRewards(state, order, nowIso, settings) {
  if (!isEligibleForOrderRewards(order)) {
    return { ...state, stampsAwarded: false, cashbackAwarded: false, stampSkipped: false };
  }

  const nowMs = Date.parse(nowIso);
  let points = state.points;
  let cashbackBalance = state.cashbackBalance;
  let ledger = [...(state.ledger ?? [])];
  let orderMeta = { ...(state.orderMetaById?.[order.id] ?? {}) };
  let stampsAwarded = false;
  let stampSkipped = false;
  let cashbackAwarded = false;
  let cashbackAmount = 0;

  const needStamps = settings.fidelityEnabled && !orderMeta.stampsAwarded;
  const needCashback = settings.cashbackEnabled && !orderMeta.cashbackAwarded;

  if (needStamps) {
    if (hasLedgerForOrder({ ledger }, order.id, "selo_pedido")) {
      orderMeta.stampsAwarded = true;
    } else if (hasLedgerForOrder({ ledger }, order.id, "selo_bloqueado") || orderMeta.stampSkipped) {
      orderMeta.stampsAwarded = true;
      orderMeta.stampSkipped = true;
      stampSkipped = true;
    } else if (!canAwardFidelityStamp({ ledger }, nowMs)) {
      ledger = [
        {
          type: "selo_bloqueado",
          at: nowIso,
          orderId: order.id,
          stampsDelta: 0,
        },
        ...ledger,
      ];
      orderMeta.stampsAwarded = true;
      orderMeta.stampSkipped = true;
      stampSkipped = true;
    } else {
      points += 1;
      ledger = [
        {
          type: "selo_pedido",
          at: nowIso,
          orderId: order.id,
          stampsDelta: 1,
        },
        ...ledger,
      ];
      orderMeta.stampsAwarded = true;
      stampsAwarded = true;
    }
  }

  if (needCashback) {
    if (hasLedgerForOrder({ ledger }, order.id, "cashback_pedido")) {
      orderMeta.cashbackAwarded = true;
    } else {
      const orderTotal = Number(order.total) || 0;
      const minOrder = Number(settings.cashbackMinOrder) || 0;
      const percent = Number(settings.cashbackPercent) || 0;
      let amount = 0;
      if (orderTotal >= minOrder && percent > 0) {
        amount = roundMoney(orderTotal * (percent / 100));
      }
      if (amount > 0) {
        cashbackBalance = roundMoney(cashbackBalance + amount);
        ledger = [
          {
            type: "cashback_pedido",
            at: nowIso,
            orderId: order.id,
            cashbackDelta: amount,
          },
          ...ledger,
        ];
        cashbackAwarded = true;
        cashbackAmount = amount;
      }
      orderMeta.cashbackAwarded = true;
      orderMeta.cashbackAmountAwarded = amount;
    }
  }

  return {
    points,
    cashbackBalance,
    ledger,
    orderMetaById: { ...(state.orderMetaById ?? {}), [order.id]: orderMeta },
    stampsAwarded,
    stampSkipped,
    cashbackAwarded,
    cashbackAmount,
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(!isEligibleForOrderRewards({ status: "new", paymentMethod: "pix", paymentStatus: "paid" }), "not done");
assert(!isEligibleForOrderRewards({ status: "cancelled", paymentMethod: "pix", paymentStatus: "paid" }), "cancelled");
assert(!isEligibleForOrderRewards({ status: "done", paymentMethod: "pix", paymentStatus: "pending" }), "unpaid pix");
assert(isEligibleForOrderRewards({ status: "done", paymentMethod: "pix", paymentStatus: "paid" }), "paid pix done");
assert(isEligibleForOrderRewards({ status: "done", paymentMethod: "cash", paymentStatus: "pending" }), "cash on delivery");
assert(isEligibleForOrderRewards({ status: "done", paymentMethod: "card", paymentStatus: "pending" }), "card on delivery");

const settings = {
  fidelityEnabled: true,
  cashbackEnabled: true,
  cashbackPercent: 3,
  cashbackMinOrder: 0,
};

let state = { points: 0, cashbackBalance: 0, ledger: [], orderMetaById: {} };

// Same day: 2 purchases → 1 stamp, 2 cashbacks
const day1a = "2026-08-13T13:00:00.000Z"; // 10:00 SP
const day1b = "2026-08-13T18:00:00.000Z"; // 15:00 SP
state = simulateRewards(
  state,
  { id: 1, status: "done", paymentMethod: "cash", total: 100 },
  day1a,
  settings,
);
assert(state.stampsAwarded && state.points === 1 && state.cashbackBalance === 3, "first purchase stamp+cashback");

state = simulateRewards(
  state,
  { id: 2, status: "done", paymentMethod: "pix", paymentStatus: "paid", total: 200 },
  day1b,
  settings,
);
assert(state.stampSkipped && state.points === 1, "second same-day purchase: no extra stamp");
assert(state.cashbackAwarded && state.cashbackBalance === 9, "second same-day purchase: cashback stacks");

// Next day: new stamp + cashback
const day2 = "2026-08-14T12:00:00.000Z"; // 09:00 SP
state = simulateRewards(
  state,
  { id: 3, status: "done", paymentMethod: "card", total: 50 },
  day2,
  settings,
);
assert(state.stampsAwarded && state.points === 2 && state.cashbackBalance === 10.5, "next day stamp+cashback");

// Idempotency: reprocess order 3
const beforeRetry = { ...state, cashbackBalance: state.cashbackBalance, points: state.points };
state = simulateRewards(
  state,
  { id: 3, status: "done", paymentMethod: "card", total: 50 },
  day2,
  settings,
);
assert(state.points === beforeRetry.points && state.cashbackBalance === beforeRetry.cashbackBalance, "retry does not double award");
assert(!state.stampsAwarded && !state.cashbackAwarded, "retry reports no new awards");

// Admin zeros balances — becomes new base; day lock remains for day2
state = {
  ...state,
  points: 0,
  cashbackBalance: 0,
  ledger: [
    { type: "ajuste_selo", at: day2, stampsDelta: -2 },
    { type: "ajuste_cashback", at: day2, cashbackDelta: -10.5 },
    ...state.ledger,
  ],
};
state = simulateRewards(
  state,
  { id: 4, status: "done", paymentMethod: "cash", total: 100 },
  "2026-08-14T20:00:00.000Z",
  settings,
);
assert(state.stampSkipped && state.points === 0, "after admin zero, same day still no stamp");
assert(state.cashbackAwarded && state.cashbackBalance === 3, "after admin zero, cashback adds from new base");

// Next day after admin zero: stamp resumes from 0
state = simulateRewards(
  state,
  { id: 5, status: "done", paymentMethod: "cash", total: 100 },
  "2026-08-15T12:00:00.000Z",
  settings,
);
assert(state.stampsAwarded && state.points === 1 && state.cashbackBalance === 6, "next day after zero: stamp from new base");

console.log("order-rewards-selftest: OK");
