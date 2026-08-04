import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";

  const products = await prisma.product.findMany({
    where: all ? undefined : { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(products);
}
