import { CashbackPanel } from "@/components/CashbackPanel";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CashbackPage() {
  const [settings, customers, recent] = await Promise.all([
    getSettings(),
    prisma.customer.findMany({
      where: {
        OR: [
          { cashbackBalanceCents: { gt: 0 } },
          { stampCount: { gt: 0 } },
        ],
      },
      orderBy: { cashbackBalanceCents: "desc" },
      take: 100,
    }),
    prisma.cashbackTransaction.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const totalBalanceCents = customers.reduce(
    (sum, customer) => sum + customer.cashbackBalanceCents,
    0,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-5xl tracking-wide">Cashback</h1>
        <p className="mt-2 text-cream/65">
          Configure o percentual (padrão 3%), acompanhe saldos e o uso em pedidos.
        </p>
      </header>
      <CashbackPanel
        cashbackPercent={settings.cashbackPercent}
        totalBalanceCents={totalBalanceCents}
        customers={customers}
        recent={recent.map((tx) => ({
          ...tx,
          createdAt: tx.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
