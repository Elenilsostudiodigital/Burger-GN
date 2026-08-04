import { describe, expect, it } from "vitest";
import {
  applyCashbackBalance,
  calculateCashbackEarned,
  calculateCashbackToUse,
} from "@/lib/cashback";

describe("Cashback", () => {
  it("earns 3% floor by default", () => {
    expect(
      calculateCashbackEarned({ eligibleAmountCents: 10000, percent: 3 }),
    ).toBe(300);
  });

  it("does not earn on zero totals", () => {
    expect(calculateCashbackEarned({ eligibleAmountCents: 0, percent: 3 })).toBe(0);
  });

  it("limits redeem to balance and order total", () => {
    expect(
      calculateCashbackToUse({
        requestedCents: 5000,
        availableBalanceCents: 1200,
        orderTotalCents: 3000,
      }),
    ).toBe(1200);

    expect(
      calculateCashbackToUse({
        requestedCents: 5000,
        availableBalanceCents: 8000,
        orderTotalCents: 2500,
      }),
    ).toBe(2500);
  });

  it("updates balance after earn and redeem", () => {
    expect(
      applyCashbackBalance({
        currentBalanceCents: 1000,
        earnedCents: 300,
        usedCents: 500,
      }),
    ).toBe(800);
  });
});
