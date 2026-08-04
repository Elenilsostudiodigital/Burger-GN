import { prisma } from "@/lib/prisma";

export async function getSettings() {
  const existing = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;

  return prisma.appSettings.create({
    data: {
      id: 1,
      autoPrintOnAccept: true,
      clubPurchasesRequired: 12,
      clubRewardProductName: "Hambúrguer Grátis",
      cashbackPercent: 3,
      storeName: "Burger GN",
    },
  });
}
