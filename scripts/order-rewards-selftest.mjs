/**
 * Eligibility rules for cashback vs fidelity.
 * Run: node scripts/order-rewards-selftest.mjs
 */

function isEligibleForOrderRewards(order) {
  if (order.status !== "done") return false;
  if (order.paymentMethod === "pix" && order.paymentStatus !== "paid") return false;
  return true;
}

function canAwardFidelityStamp(lastStampAt, nowMs, cooldownMs) {
  if (!lastStampAt) return true;
  return nowMs >= new Date(lastStampAt).getTime() + cooldownMs;
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

const DAY = 24 * 60 * 60 * 1000;
const t0 = Date.parse("2026-08-13T10:00:00.000Z");
assert(canAwardFidelityStamp(null, t0, DAY), "first stamp");
assert(!canAwardFidelityStamp("2026-08-13T10:00:00.000Z", t0 + 2 * 3600_000, DAY), "same day blocked");
assert(canAwardFidelityStamp("2026-08-13T10:00:00.000Z", t0 + DAY, DAY), "next day allowed");

console.log("order-rewards-selftest: OK");
