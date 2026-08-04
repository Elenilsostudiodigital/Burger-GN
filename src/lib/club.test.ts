import { describe, expect, it } from "vitest";
import { applyStampReward, progressPercent } from "@/lib/club";

describe("Clube Burger stamps", () => {
  it("adds one stamp without granting reward before goal", () => {
    const result = applyStampReward({
      currentStamps: 5,
      currentFreeBurgers: 0,
      purchasesRequired: 12,
    });

    expect(result).toEqual({
      stampsAdded: 1,
      stampCountAfter: 6,
      freeBurgersGranted: 0,
      freeBurgersAvailableAfter: 0,
    });
  });

  it("grants free burger and resets surplus when goal is reached", () => {
    const result = applyStampReward({
      currentStamps: 11,
      currentFreeBurgers: 0,
      purchasesRequired: 12,
    });

    expect(result.freeBurgersGranted).toBe(1);
    expect(result.freeBurgersAvailableAfter).toBe(1);
    expect(result.stampCountAfter).toBe(0);
  });

  it("can grant multiple rewards if stamps overflow", () => {
    const result = applyStampReward({
      currentStamps: 11,
      currentFreeBurgers: 1,
      purchasesRequired: 5,
      stampsToAdd: 10,
    });

    // 11 + 10 = 21 → 4 rewards (20 stamps) → 1 stamp left, free burgers 1+4
    expect(result.freeBurgersGranted).toBe(4);
    expect(result.stampCountAfter).toBe(1);
    expect(result.freeBurgersAvailableAfter).toBe(5);
  });

  it("computes progress percent capped at 100", () => {
    expect(progressPercent(6, 12)).toBe(50);
    expect(progressPercent(12, 12)).toBe(100);
    expect(progressPercent(20, 12)).toBe(100);
  });
});
