import { OrdersPanel } from "@/components/OrdersPanel";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const orders = await prisma.order.findMany({
    include: { items: true, customer: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-5xl tracking-wide">Pedidos</h1>
        <p className="mt-2 text-cream/65">
          Aceite pedidos (com impressão automática), imprima manualmente e conclua
          compras para gerar selo e cashback.
        </p>
      </header>
      <OrdersPanel
        initialOrders={orders.map((order) => ({
          ...order,
          printedAt: order.printedAt?.toISOString() ?? null,
          createdAt: order.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
