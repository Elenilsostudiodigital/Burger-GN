import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = (searchParams.get("phone") || "").replace(/\D/g, "");

  if (phone.length < 8) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
  }

  const settings = await getSettings();
  const customer = await prisma.customer.findUnique({
    where: { phone },
  });

  if (!customer) {
    return NextResponse.json({
      found: false,
      cashbackPercent: settings.cashbackPercent,
      clubPurchasesRequired: settings.clubPurchasesRequired,
      clubRewardProductName: settings.clubRewardProductName,
    });
  }

  return NextResponse.json({
    found: true,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      cashbackBalanceCents: customer.cashbackBalanceCents,
      stampCount: customer.stampCount,
      freeBurgersAvailable: customer.freeBurgersAvailable,
    },
    cashbackPercent: settings.cashbackPercent,
    clubPurchasesRequired: settings.clubPurchasesRequired,
    clubRewardProductName: settings.clubRewardProductName,
  });
}
