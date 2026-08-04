"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/format";

type Product = {
  id: string;
  name: string;
  priceCents: number;
};

type Customer = {
  id: string;
  name: string;
  phone: string;
  stampCount: number;
  freeBurgersAvailable: number;
  cashbackBalanceCents: number;
};

type StampTx = {
  id: string;
  delta: number;
  stampCountAfter: number;
  freeBurgersGranted: number;
  description: string;
  createdAt: string;
  customer: { name: string; phone: string };
};

type Props = {
  clubPurchasesRequired: number;
  clubRewardProductId: string | null;
  clubRewardProductName: string;
  products: Product[];
  members: Customer[];
  recentStamps: StampTx[];
};

export function ClubPanel({
  clubPurchasesRequired,
  clubRewardProductId,
  clubRewardProductName,
  products,
  members,
  recentStamps,
}: Props) {
  const [required, setRequired] = useState(clubPurchasesRequired);
  const [rewardId, setRewardId] = useState(clubRewardProductId || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [memberList, setMemberList] = useState(members);
  const [stamps, setStamps] = useState(recentStamps);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubPurchasesRequired: required,
          clubRewardProductId: rewardId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      setMessage(
        `Clube atualizado: ${data.clubPurchasesRequired} compras → ${data.clubRewardProductName}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function refreshClub() {
    const res = await fetch("/api/club");
    const data = await res.json();
    setMemberList(data.members);
    setStamps(
      data.recentStamps.map((tx: StampTx & { createdAt: string }) => ({
        ...tx,
        createdAt: tx.createdAt,
      })),
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={saveSettings} className="panel space-y-4 p-5">
        <h2 className="font-display text-3xl tracking-wide">Configuração do clube</h2>
        <p className="text-sm text-cream/60">
          Cada compra concluída gera automaticamente 1 selo. Ao atingir a meta, o
          sistema libera um hambúrguer grátis configurável.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Compras para o prêmio</span>
            <input
              className="field"
              type="number"
              min={1}
              max={100}
              value={required}
              onChange={(e) => setRequired(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Hambúrguer prêmio</span>
            <select
              className="field"
              value={rewardId}
              onChange={(e) => setRewardId(e.target.value)}
            >
              <option value="">Manter: {clubRewardProductName}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({formatBRL(product.priceCents)})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-lg border border-mustard/30 bg-mustard/10 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-mustard">Como funciona</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: Math.min(required, 12) }).map((_, index) => (
              <span
                key={index}
                className="animate-stamp inline-flex h-8 w-8 items-center justify-center rounded-full border border-cream/20 text-xs"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {index + 1}
              </span>
            ))}
            {required > 12 && (
              <span className="text-sm text-cream/55">+{required - 12}</span>
            )}
          </div>
          <p className="mt-3 text-sm text-cream/75">
            Meta atual: <strong>{required}</strong> selos →{" "}
            <strong>{clubRewardProductName}</strong>
          </p>
        </div>

        <button type="submit" className="btn-primary" disabled={busy}>
          Salvar Clube Burger
        </button>
        {message && <p className="text-sm text-cream/80">{message}</p>}
      </form>

      <section className="panel p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-3xl tracking-wide">Membros</h2>
          <button type="button" className="btn-secondary" onClick={refreshClub}>
            Atualizar
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-cream/50">
              <tr>
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4">Selos</th>
                <th className="py-2 pr-4">Burgers grátis</th>
                <th className="py-2">Cashback</th>
              </tr>
            </thead>
            <tbody>
              {memberList.map((member) => (
                <tr key={member.id} className="border-t border-cream/10">
                  <td className="py-2 pr-4">
                    <div>{member.name}</div>
                    <div className="text-xs text-cream/45">{member.phone}</div>
                  </td>
                  <td className="py-2 pr-4">
                    {member.stampCount}/{required}
                  </td>
                  <td className="py-2 pr-4">{member.freeBurgersAvailable}</td>
                  <td className="py-2">{formatBRL(member.cashbackBalanceCents)}</td>
                </tr>
              ))}
              {memberList.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-cream/55">
                    Ainda não há membros no clube.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-3xl tracking-wide">Últimos selos</h2>
        <ul className="mt-4 space-y-3">
          {stamps.map((tx) => (
            <li key={tx.id} className="border-b border-cream/10 pb-3 text-sm">
              <p className="font-medium">
                {tx.customer.name} · +{tx.delta} selo
                {tx.freeBurgersGranted > 0
                  ? ` · ${tx.freeBurgersGranted} prêmio(s) liberado(s)`
                  : ""}
              </p>
              <p className="text-cream/55">{tx.description}</p>
              <p className="text-xs text-cream/40">
                {new Date(tx.createdAt).toLocaleString("pt-BR")}
              </p>
            </li>
          ))}
          {stamps.length === 0 && (
            <li className="text-cream/55">Nenhum selo registrado ainda.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
