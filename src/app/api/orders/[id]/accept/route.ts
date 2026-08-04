import { NextResponse } from "next/server";
import { acceptOrder } from "@/lib/orders";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const result = await acceptOrder(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao aceitar pedido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
