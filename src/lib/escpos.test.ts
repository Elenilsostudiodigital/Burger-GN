import { describe, expect, it } from "vitest";
import { buildEscPosReceipt } from "@/lib/escpos";

describe("ESC/POS receipt", () => {
  it("builds a buffer with store name, order code and cut command", () => {
    const buffer = buildEscPosReceipt(
      {
        code: "BGN-TEST-001",
        customerName: "Ana",
        customerPhone: "11999990000",
        status: "ACCEPTED",
        subtotalCents: 2490,
        cashbackUsedCents: 0,
        cashbackEarnedCents: 74,
        freeBurgerApplied: false,
        totalCents: 2490,
        createdAt: new Date("2026-08-04T12:00:00Z"),
        items: [
          {
            name: "X-Burger",
            quantity: 1,
            unitPriceCents: 2490,
          },
        ],
      },
      {
        storeName: "Burger GN",
        storePhone: "1100000000",
      },
      "80",
    );

    const text = buffer.toString("latin1");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(50);
    expect(text).toContain("Burger GN");
    expect(text).toContain("BGN-TEST-001");
    // GS V 1 partial cut
    expect(buffer.includes(Buffer.from([0x1d, 0x56, 0x01]))).toBe(true);
  });

  it("supports 58mm narrower layout", () => {
    const buffer = buildEscPosReceipt(
      {
        code: "BGN-58",
        customerName: "Bruno",
        customerPhone: "11988887777",
        status: "PENDING",
        subtotalCents: 1000,
        cashbackUsedCents: 100,
        cashbackEarnedCents: 27,
        freeBurgerApplied: true,
        totalCents: 900,
        createdAt: new Date(),
        items: [
          { name: "Batata", quantity: 1, unitPriceCents: 1000 },
          {
            name: "X-Burger",
            quantity: 1,
            unitPriceCents: 0,
            isFreeReward: true,
          },
        ],
      },
      { storeName: "Burger GN" },
      "58",
    );

    const text = buffer.toString("latin1");
    expect(text).toContain("Cashback usado");
    expect(text).toContain("GRATIS");
  });
});
