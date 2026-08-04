import { NextResponse } from "next/server";
import { z } from "zod";
import { printOrderById } from "@/lib/orders";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  printerId: z.string().optional(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const result = await printOrderById(id, parsed.data.printerId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao imprimir pedido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
