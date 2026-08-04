import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { cashbackBalanceCents: { gt: 0 } },
        { stampCount: { gt: 0 } },
      ],
    },
    orderBy: { cashbackBalanceCents: "desc" },
    take: 100,
  });

  const recent = await prisma.cashbackTransaction.findMany({
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const totalBalance = customers.reduce(
    (sum, customer) => sum + customer.cashbackBalanceCents,
    0,
  );

  return NextResponse.json({
    cashbackPercent: settings.cashbackPercent,
    totalBalanceCents: totalBalance,
    customers,
    recent,
  });
}
