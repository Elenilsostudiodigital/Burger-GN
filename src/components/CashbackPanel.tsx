"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/format";

type Customer = {
  id: string;
  name: string;
  phone: string;
  cashbackBalanceCents: number;
  stampCount: number;
};

type Tx = {
  id: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  createdAt: string;
  customer: { name: string; phone: string };
};

type Props = {
  cashbackPercent: number;
  totalBalanceCents: number;
  customers: Customer[];
  recent: Tx[];
};

export function CashbackPanel({
  cashbackPercent,
  totalBalanceCents,
  customers,
  recent,
}: Props) {
  const [percent, setPercent] = useState(cashbackPercent);
  const [total, setTotal] = useState(totalBalanceCents);
  const [list, setList] = useState(customers);
  const [txs, setTxs] = useState(recent);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function savePercent(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashbackPercent: percent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      setMessage(`Cashback atualizado para ${data.cashbackPercent}%`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const res = await fetch("/api/cashback");
    const data = await res.json();
    setPercent(data.cashbackPercent);
    setTotal(data.totalBalanceCents);
    setList(data.customers);
    setTxs(
      data.recent.map((tx: Tx) => ({
        ...tx,
        createdAt: tx.createdAt,
      })),
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={savePercent} className="panel space-y-4 p-5">
        <h2 className="font-display text-3xl tracking-wide">Percentual de cashback</h2>
        <p className="text-sm text-cream/60">
          Valor inicial: 3%. O saldo acumula por cliente e pode ser usado em compras
          futuras no checkout.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Percentual (%)</span>
            <input
              className="field w-40"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            Salvar percentual
          </button>
          <button type="button" className="btn-secondary" onClick={refresh}>
            Atualizar saldos
          </button>
        </div>
        <p className="text-sm text-mustard">
          Saldo acumulado em clientes: {formatBRL(total)}
        </p>
        {message && <p className="text-sm text-cream/80">{message}</p>}
      </form>

      <section className="panel p-5">
        <h2 className="font-display text-3xl tracking-wide">Saldos por cliente</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-cream/50">
              <tr>
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4">Saldo</th>
                <th className="py-2">Selos</th>
              </tr>
            </thead>
            <tbody>
              {list.map((customer) => (
                <tr key={customer.id} className="border-t border-cream/10">
                  <td className="py-2 pr-4">
                    <div>{customer.name}</div>
                    <div className="text-xs text-cream/45">{customer.phone}</div>
                  </td>
                  <td className="py-2 pr-4 text-mustard">
                    {formatBRL(customer.cashbackBalanceCents)}
                  </td>
                  <td className="py-2">{customer.stampCount}</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-cream/55">
                    Nenhum saldo de cashback ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-3xl tracking-wide">Movimentações</h2>
        <ul className="mt-4 space-y-3">
          {txs.map((tx) => (
            <li key={tx.id} className="border-b border-cream/10 pb-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-medium">
                  {tx.customer.name} · {tx.type === "EARN" ? "Crédito" : "Uso"}
                </p>
                <p className={tx.amountCents >= 0 ? "text-green-300" : "text-flame"}>
                  {formatBRL(tx.amountCents)}
                </p>
              </div>
              <p className="text-cream/55">{tx.description}</p>
              <p className="text-xs text-cream/40">
                Saldo após: {formatBRL(tx.balanceAfterCents)} ·{" "}
                {new Date(tx.createdAt).toLocaleString("pt-BR")}
              </p>
            </li>
          ))}
          {txs.length === 0 && (
            <li className="text-cream/55">Nenhuma movimentação registrada.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
