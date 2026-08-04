import Link from "next/link";
import { Storefront } from "@/components/Storefront";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [products, settings] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, isReward: false },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    getSettings(),
  ]);

  return (
    <div className="texture-grid min-h-screen">
      <header className="relative overflow-hidden border-b border-cream/10">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(120deg, rgba(26,20,16,0.2), rgba(26,20,16,0.85)), url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"160\" height=\"160\" viewBox=\"0 0 160 160\"><circle cx=\"20\" cy=\"20\" r=\"2\" fill=\"%23c45c26\" opacity=\"0.35\"/><circle cx=\"90\" cy=\"70\" r=\"1.5\" fill=\"%23d4a017\" opacity=\"0.25\"/><circle cx=\"140\" cy=\"120\" r=\"2\" fill=\"%23e07a3a\" opacity=\"0.2\"/></svg>')",
          }}
        />
        <div className="relative mx-auto flex max-w-6xl items-end justify-between gap-6 px-4 py-10 md:px-8 md:py-14">
          <div className="animate-rise">
            <p className="font-display text-6xl leading-none tracking-wide text-cream md:text-8xl">
              Burger GN
            </p>
            <h1 className="mt-3 max-w-xl text-lg text-cream/80 md:text-xl">
              Smash na grelha, selo no Clube e cashback em toda compra.
            </h1>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#cardapio" className="btn-primary animate-glow">
                Montar pedido
              </a>
              <Link href="/admin" className="btn-secondary">
                Painel admin
              </Link>
            </div>
          </div>
          <div className="hidden animate-rise panel max-w-xs p-4 md:block" style={{ animationDelay: "120ms" }}>
            <p className="text-xs uppercase tracking-[0.18em] text-mustard">Clube Burger</p>
            <p className="mt-2 font-display text-4xl text-cream">
              {settings.clubPurchasesRequired} selos
            </p>
            <p className="mt-1 text-sm text-cream/65">
              Ganhe 1 selo por compra e liberte um {settings.clubRewardProductName}. Cashback de{" "}
              {settings.cashbackPercent}%.
            </p>
          </div>
        </div>
      </header>

      <Storefront
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          priceCents: p.priceCents,
          category: p.category,
        }))}
        cashbackPercent={settings.cashbackPercent}
        clubPurchasesRequired={settings.clubPurchasesRequired}
        clubRewardProductName={settings.clubRewardProductName}
      />
    </div>
  );
}
