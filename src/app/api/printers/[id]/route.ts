import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  paperWidth: z.enum(["58", "80"]).optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.printer.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Impressora não encontrada" }, { status: 404 });
  }

  const printer = await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.printer.updateMany({ data: { isDefault: false } });
    }
    return tx.printer.update({
      where: { id },
      data: parsed.data,
    });
  });

  return NextResponse.json(printer);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const existing = await prisma.printer.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Impressora não encontrada" }, { status: 404 });
  }

  await prisma.printer.delete({ where: { id } });

  if (existing.isDefault) {
    const next = await prisma.printer.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await prisma.printer.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
