import { NextResponse } from "next/server";
import { completeOrder } from "@/lib/orders";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const order = await completeOrder(id);
    return NextResponse.json(order);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao concluir pedido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
