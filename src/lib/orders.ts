import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { applyStampReward } from "@/lib/club";
import {
  applyCashbackBalance,
  calculateCashbackEarned,
  calculateCashbackToUse,
} from "@/lib/cashback";
import { printOrderReceipt, type PaperWidth } from "@/lib/escpos";

export type CartItemInput = {
  productId: string;
  quantity: number;
};

type DraftLineItem = {
  productId: string | null;
  name: string;
  unitPriceCents: number;
  quantity: number;
  isFreeReward: boolean;
};

export type CreateOrderInput = {
  customerName: string;
  customerPhone: string;
  notes?: string;
  items: CartItemInput[];
  useCashbackCents?: number;
  useFreeBurger?: boolean;
};

function generateOrderCode(): string {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 12);
  const rand = Math.floor(Math.random() * 900 + 100);
  return `BGN-${stamp}-${rand}`;
}

async function upsertCustomer(name: string, phone: string) {
  const normalized = phone.replace(/\D/g, "");
  return prisma.customer.upsert({
    where: { phone: normalized },
    create: {
      name,
      phone: normalized,
    },
    update: {
      name,
    },
  });
}

export async function createOrder(input: CreateOrderInput) {
  if (!input.items.length) {
    throw new Error("Pedido sem itens");
  }

  const settings = await getSettings();
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
  });

  if (products.length !== new Set(productIds).size) {
    throw new Error("Um ou mais produtos são inválidos");
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  const customer = await upsertCustomer(input.customerName, input.customerPhone);

  let subtotalCents = 0;
  const lineItems: DraftLineItem[] = input.items.map((item) => {
    const product = productMap.get(item.productId)!;
    const quantity = Math.max(1, Math.floor(item.quantity));
    subtotalCents += product.priceCents * quantity;
    return {
      productId: product.id,
      name: product.name,
      unitPriceCents: product.priceCents,
      quantity,
      isFreeReward: false,
    };
  });

  let freeBurgerApplied = false;
  if (input.useFreeBurger) {
    if (customer.freeBurgersAvailable <= 0) {
      throw new Error("Cliente não possui hambúrguer grátis disponível");
    }

    let rewardProduct =
      settings.clubRewardProductId
        ? await prisma.product.findUnique({
            where: { id: settings.clubRewardProductId },
          })
        : null;

    if (!rewardProduct) {
      rewardProduct = await prisma.product.findFirst({
        where: { isReward: true, active: true },
      });
    }

    const rewardName = rewardProduct?.name || settings.clubRewardProductName;

    lineItems.push({
      productId: rewardProduct?.id ?? null,
      name: rewardName,
      unitPriceCents: 0,
      quantity: 1,
      isFreeReward: true,
    });
    freeBurgerApplied = true;
  }

  const cashbackUsedCents = calculateCashbackToUse({
    requestedCents: input.useCashbackCents ?? 0,
    availableBalanceCents: customer.cashbackBalanceCents,
    orderTotalCents: subtotalCents,
  });

  const totalCents = Math.max(0, subtotalCents - cashbackUsedCents);

  // Cashback is earned on the amount actually paid (after cashback redemption)
  const cashbackEarnedCents = calculateCashbackEarned({
    eligibleAmountCents: totalCents,
    percent: settings.cashbackPercent,
  });

  const order = await prisma.$transaction(async (tx) => {
    if (freeBurgerApplied) {
      await tx.customer.update({
        where: { id: customer.id },
        data: { freeBurgersAvailable: { decrement: 1 } },
      });
    }

    let balanceAfterRedeem = customer.cashbackBalanceCents;
    if (cashbackUsedCents > 0) {
      const updated = await tx.customer.update({
        where: { id: customer.id },
        data: { cashbackBalanceCents: { decrement: cashbackUsedCents } },
      });
      balanceAfterRedeem = updated.cashbackBalanceCents;
    }

    const created = await tx.order.create({
      data: {
        code: generateOrderCode(),
        status: "PENDING",
        customerId: customer.id,
        customerName: input.customerName,
        customerPhone: customer.phone,
        subtotalCents,
        cashbackUsedCents,
        cashbackEarnedCents,
        freeBurgerApplied,
        stampAwarded: false,
        totalCents,
        notes: input.notes ?? "",
        items: {
          create: lineItems.map((item) => ({
            productId: item.productId,
            name: item.name,
            unitPriceCents: item.unitPriceCents,
            quantity: item.quantity,
            isFreeReward: item.isFreeReward,
          })),
        },
      },
      include: { items: true, customer: true },
    });

    if (cashbackUsedCents > 0) {
      await tx.cashbackTransaction.create({
        data: {
          customerId: customer.id,
          orderId: created.id,
          type: "REDEEM",
          amountCents: -cashbackUsedCents,
          balanceAfterCents: balanceAfterRedeem,
          description: `Cashback utilizado no pedido ${created.code}`,
        },
      });
    }

    return created;
  });

  return order;
}

export async function acceptOrder(orderId: string) {
  const settings = await getSettings();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: true },
  });

  if (!order) throw new Error("Pedido não encontrado");
  if (order.status !== "PENDING") {
    throw new Error("Somente pedidos pendentes podem ser aceitos");
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    },
    include: { items: true, customer: true },
  });

  let printError: string | null = null;
  if (settings.autoPrintOnAccept) {
    try {
      await printOrderById(orderId);
    } catch (error) {
      printError =
        error instanceof Error ? error.message : "Falha ao imprimir automaticamente";
    }
  }

  return { order: updated, printError };
}

export async function completeOrder(orderId: string) {
  const settings = await getSettings();

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { customer: true, items: true },
    });

    if (!order) throw new Error("Pedido não encontrado");
    if (!["ACCEPTED", "PREPARING", "READY"].includes(order.status) && order.status !== "PENDING") {
      if (order.status === "COMPLETED") return order;
      throw new Error("Pedido não pode ser concluído neste status");
    }

    if (!order.customerId || !order.customer) {
      throw new Error("Pedido sem cliente vinculado");
    }

    let customer = order.customer;

    // Award cashback if not already applied via ledger for this order
    const existingEarn = await tx.cashbackTransaction.findFirst({
      where: { orderId: order.id, type: "EARN" },
    });

    if (!existingEarn && order.cashbackEarnedCents > 0) {
      const newBalance = applyCashbackBalance({
        currentBalanceCents: customer.cashbackBalanceCents,
        earnedCents: order.cashbackEarnedCents,
        usedCents: 0,
      });
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: { cashbackBalanceCents: newBalance },
      });
      await tx.cashbackTransaction.create({
        data: {
          customerId: customer.id,
          orderId: order.id,
          type: "EARN",
          amountCents: order.cashbackEarnedCents,
          balanceAfterCents: newBalance,
          description: `Cashback ${settings.cashbackPercent}% do pedido ${order.code}`,
        },
      });
    }

    // Award 1 stamp per completed purchase
    if (!order.stampAwarded) {
      const stampResult = applyStampReward({
        currentStamps: customer.stampCount,
        currentFreeBurgers: customer.freeBurgersAvailable,
        purchasesRequired: settings.clubPurchasesRequired,
        stampsToAdd: 1,
      });

      customer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          stampCount: stampResult.stampCountAfter,
          freeBurgersAvailable: stampResult.freeBurgersAvailableAfter,
        },
      });

      await tx.stampTransaction.create({
        data: {
          customerId: customer.id,
          orderId: order.id,
          delta: 1,
          stampCountAfter: stampResult.stampCountAfter,
          freeBurgersGranted: stampResult.freeBurgersGranted,
          description:
            stampResult.freeBurgersGranted > 0
              ? `Selo +1. Meta atingida! ${stampResult.freeBurgersGranted} hambúrguer(es) grátis liberado(s).`
              : `Selo +1 do pedido ${order.code}`,
        },
      });
    }

    return tx.order.update({
      where: { id: order.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        stampAwarded: true,
      },
      include: { items: true, customer: true },
    });
  });
}

export async function printOrderById(orderId: string, printerId?: string) {
  const settings = await getSettings();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) throw new Error("Pedido não encontrado");

  const printer = printerId
    ? await prisma.printer.findUnique({ where: { id: printerId } })
    : await prisma.printer.findFirst({
        where: { active: true, isDefault: true },
      }) ??
      (await prisma.printer.findFirst({ where: { active: true } }));

  if (!printer) {
    throw new Error("Nenhuma impressora ativa cadastrada");
  }

  await printOrderReceipt({
    host: printer.host,
    port: printer.port,
    paperWidth: printer.paperWidth as PaperWidth,
    store: {
      storeName: settings.storeName,
      storePhone: settings.storePhone,
      storeAddress: settings.storeAddress,
    },
    order: {
      code: order.code,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,
      notes: order.notes,
      subtotalCents: order.subtotalCents,
      cashbackUsedCents: order.cashbackUsedCents,
      cashbackEarnedCents: order.cashbackEarnedCents,
      freeBurgerApplied: order.freeBurgerApplied,
      totalCents: order.totalCents,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        isFreeReward: item.isFreeReward,
      })),
    },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { printedAt: new Date() },
  });

  return { printer: printer.name };
}
