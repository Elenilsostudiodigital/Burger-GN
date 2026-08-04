import { ClubPanel } from "@/components/ClubPanel";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ClubePage() {
  const [settings, products, members, recentStamps] = await Promise.all([
    getSettings(),
    prisma.product.findMany({
      where: { active: true, category: "Hambúrgueres" },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({
      orderBy: { stampCount: "desc" },
      take: 50,
    }),
    prisma.stampTransaction.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-5xl tracking-wide">Clube Burger</h1>
        <p className="mt-2 text-cream/65">
          Fidelidade por selos: 1 compra concluída = 1 selo. Meta padrão de 12 compras
          para liberar um hambúrguer grátis.
        </p>
      </header>
      <ClubPanel
        clubPurchasesRequired={settings.clubPurchasesRequired}
        clubRewardProductId={settings.clubRewardProductId}
        clubRewardProductName={settings.clubRewardProductName}
        products={products}
        members={members}
        recentStamps={recentStamps.map((tx) => ({
          ...tx,
          createdAt: tx.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
