import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const printers = await prisma.printer.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(printers);
}

const createSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(9100),
  paperWidth: z.enum(["58", "80"]).default("80"),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const printer = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.printer.updateMany({ data: { isDefault: false } });
    }

    const count = await tx.printer.count();
    return tx.printer.create({
      data: {
        name: data.name,
        host: data.host,
        port: data.port,
        paperWidth: data.paperWidth,
        isDefault: data.isDefault ?? count === 0,
        active: data.active ?? true,
      },
    });
  });

  return NextResponse.json(printer, { status: 201 });
}
