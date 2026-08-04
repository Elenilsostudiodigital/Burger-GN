import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

const updateSchema = z.object({
  autoPrintOnAccept: z.boolean().optional(),
  clubPurchasesRequired: z.number().int().min(1).max(100).optional(),
  clubRewardProductId: z.string().nullable().optional(),
  clubRewardProductName: z.string().min(1).optional(),
  cashbackPercent: z.number().min(0).max(100).optional(),
  storeName: z.string().min(1).optional(),
  storePhone: z.string().optional(),
  storeAddress: z.string().optional(),
});

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await getSettings();

  const data = { ...parsed.data };

  if (data.clubRewardProductId) {
    const product = await prisma.product.findUnique({
      where: { id: data.clubRewardProductId },
    });
    if (!product) {
      return NextResponse.json(
        { error: "Produto prêmio não encontrado" },
        { status: 404 },
      );
    }
    data.clubRewardProductName = product.name;
  }

  const settings = await prisma.appSettings.update({
    where: { id: 1 },
    data,
  });

  return NextResponse.json(settings);
}
