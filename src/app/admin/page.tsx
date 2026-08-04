import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { formatBRL } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const [settings, pending, printers, customers, cashbackSum] = await Promise.all([
    getSettings(),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.printer.count({ where: { active: true } }),
    prisma.customer.count(),
    prisma.customer.aggregate({ _sum: { cashbackBalanceCents: true } }),
  ]);

  const cards = [
    {
      title: "Pedidos pendentes",
      value: String(pending),
      href: "/admin/pedidos",
      hint: "Aceitar e imprimir",
    },
    {
      title: "Impressoras ativas",
      value: String(printers),
      href: "/admin/impressoras",
      hint: settings.autoPrintOnAccept
        ? "Impressão automática ligada"
        : "Impressão automática desligada",
    },
    {
      title: "Clube Burger",
      value: `${settings.clubPurchasesRequired} selos`,
      href: "/admin/clube",
      hint: settings.clubRewardProductName,
    },
    {
      title: "Cashback",
      value: `${settings.cashbackPercent}%`,
      href: "/admin/cashback",
      hint: `Saldo total ${formatBRL(cashbackSum._sum.cashbackBalanceCents ?? 0)} · ${customers} clientes`,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-5xl tracking-wide text-cream">Painel</h1>
        <p className="mt-2 text-cream/65">
          Gerencie pedidos, impressoras térmicas ESC/POS, Clube Burger e cashback.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card, index) => (
          <Link
            key={card.href}
            href={card.href}
            className="panel animate-rise block p-5 transition hover:border-ember/40"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <p className="text-xs uppercase tracking-[0.18em] text-cream/45">{card.title}</p>
            <p className="mt-2 font-display text-4xl text-cream">{card.value}</p>
            <p className="mt-2 text-sm text-cream/60">{card.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
