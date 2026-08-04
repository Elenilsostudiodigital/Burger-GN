"use client";

import { useState } from "react";
import { formatBRL, ORDER_STATUS_LABEL } from "@/lib/format";

type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  isFreeReward: boolean;
};

type Order = {
  id: string;
  code: string;
  status: string;
  customerName: string;
  customerPhone: string;
  subtotalCents: number;
  cashbackUsedCents: number;
  cashbackEarnedCents: number;
  freeBurgerApplied: boolean;
  totalCents: number;
  notes: string;
  printedAt: string | null;
  createdAt: string;
  items: OrderItem[];
  customer?: {
    stampCount: number;
    freeBurgersAvailable: number;
    cashbackBalanceCents: number;
  } | null;
};

export function OrdersPanel({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/orders");
    const data = await res.json();
    setOrders(data);
  }

  async function runAction(
    orderId: string,
    path: string,
    successMessage: string,
  ) {
    setBusyId(orderId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na ação");

      const extra =
        path === "accept" && data.printError
          ? ` (aviso impressão: ${data.printError})`
          : "";
      setFeedback(`${successMessage}${extra}`);
      await refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Erro inesperado");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <p className="rounded-md border border-cream/15 bg-cream/5 px-3 py-2 text-sm">
          {feedback}
        </p>
      )}

      {orders.length === 0 && (
        <p className="panel p-6 text-cream/60">Nenhum pedido por enquanto.</p>
      )}

      {orders.map((order) => (
        <article key={order.id} className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-3xl tracking-wide text-cream">
                {order.code}
              </p>
              <p className="mt-1 text-sm text-cream/65">
                {order.customerName} · {order.customerPhone} ·{" "}
                {ORDER_STATUS_LABEL[order.status] || order.status}
              </p>
              <p className="text-xs text-cream/45">
                {new Date(order.createdAt).toLocaleString("pt-BR")}
                {order.printedAt
                  ? ` · Impresso ${new Date(order.printedAt).toLocaleString("pt-BR")}`
                  : " · Ainda não impresso"}
              </p>
            </div>
            <p className="text-lg font-semibold text-mustard">
              {formatBRL(order.totalCents)}
            </p>
          </div>

          <ul className="mt-4 space-y-1 text-sm text-cream/80">
            {order.items.map((item) => (
              <li key={item.id}>
                {item.quantity}x {item.name}
                {item.isFreeReward ? " (grátis)" : ` — ${formatBRL(item.unitPriceCents * item.quantity)}`}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-cream/55">
            {order.cashbackUsedCents > 0 && (
              <span>Cashback usado: {formatBRL(order.cashbackUsedCents)}</span>
            )}
            {order.cashbackEarnedCents > 0 && (
              <span>Cashback a ganhar: {formatBRL(order.cashbackEarnedCents)}</span>
            )}
            {order.freeBurgerApplied && <span>Prêmio Clube aplicado</span>}
            {order.customer && (
              <span>
                Selos: {order.customer.stampCount} · Saldo:{" "}
                {formatBRL(order.customer.cashbackBalanceCents)}
              </span>
            )}
          </div>

          {order.notes && (
            <p className="mt-3 text-sm text-cream/70">Obs: {order.notes}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {order.status === "PENDING" && (
              <button
                type="button"
                className="btn-primary"
                disabled={busyId === order.id}
                onClick={() => runAction(order.id, "accept", "Pedido aceito")}
              >
                Aceitar
              </button>
            )}
            {["PENDING", "ACCEPTED", "PREPARING", "READY"].includes(order.status) && (
              <button
                type="button"
                className="btn-secondary"
                disabled={busyId === order.id}
                onClick={() => runAction(order.id, "complete", "Pedido concluído · selo e cashback aplicados")}
              >
                Concluir compra
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={busyId === order.id}
              onClick={() => runAction(order.id, "print", "Cupom enviado à impressora")}
            >
              Imprimir
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
