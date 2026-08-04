/**
 * Pure helpers for cashback earn / redeem calculations.
 */

export function calculateCashbackEarned(params: {
  eligibleAmountCents: number;
  percent: number;
}): number {
  if (params.eligibleAmountCents <= 0 || params.percent <= 0) return 0;
  return Math.floor((params.eligibleAmountCents * params.percent) / 100);
}

export function calculateCashbackToUse(params: {
  requestedCents: number;
  availableBalanceCents: number;
  orderTotalCents: number;
}): number {
  const requested = Math.max(0, Math.floor(params.requestedCents));
  const available = Math.max(0, params.availableBalanceCents);
  const total = Math.max(0, params.orderTotalCents);
  return Math.min(requested, available, total);
}

export function applyCashbackBalance(params: {
  currentBalanceCents: number;
  earnedCents: number;
  usedCents: number;
}): number {
  return Math.max(
    0,
    params.currentBalanceCents + params.earnedCents - params.usedCents,
  );
}
