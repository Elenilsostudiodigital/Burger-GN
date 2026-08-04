import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  const rewardProduct = settings.clubRewardProductId
    ? await prisma.product.findUnique({
        where: { id: settings.clubRewardProductId },
      })
    : await prisma.product.findFirst({ where: { isReward: true } });

  const members = await prisma.customer.findMany({
    orderBy: { stampCount: "desc" },
    take: 50,
  });

  const recentStamps = await prisma.stampTransaction.findMany({
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    settings: {
      clubPurchasesRequired: settings.clubPurchasesRequired,
      clubRewardProductId: settings.clubRewardProductId,
      clubRewardProductName: settings.clubRewardProductName,
      cashbackPercent: settings.cashbackPercent,
    },
    rewardProduct,
    members,
    recentStamps,
  });
}
