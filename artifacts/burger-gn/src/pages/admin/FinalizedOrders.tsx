import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  getFinalizedOrders,
  Order,
  PAYMENT_METHOD_LABELS,
} from "../../lib/api";
import { formatPrepDuration } from "../../lib/prepTimer";
import { useAdmin } from "../../context/AdminContext";
import { AdminBottomNav } from "../../components/AdminBottomNav";
import {
  ArrowLeft, LogOut, Loader2, LayoutDashboard, CheckCircle2,
} from "lucide-react";

function fmtMoney(v: string | number) {
  const n = typeof v === "number" ? v : parseFloat(String(v || "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  return formatPrepDuration(seconds);
}

export default function FinalizedOrders() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setOrders(await getFinalizedOrders(300));
      } catch {
        setError("Não foi possível carregar o histórico.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/pedidos" className="p-2 text-zinc-400 hover:text-white">
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <h1 className="text-white font-black uppercase text-base leading-none truncate flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-400" /> Finalizados
              </h1>
              <p className="text-zinc-600 text-xs mt-0.5">Histórico administrativo de pedidos concluídos</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/admin/pedidos" className="p-2 text-zinc-400 hover:text-amber-400" title="Painel operacional">
              <LayoutDashboard size={18} />
            </Link>
            <button
              type="button"
              onClick={async () => { await logout(); setLocation("/"); }}
              className="p-2 text-zinc-400 hover:text-red-400"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-3">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-amber-500" size={28} />
          </div>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!loading && !error && orders.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-500 text-sm">
            Nenhum pedido finalizado ainda.
          </div>
        )}

        {!loading && orders.map((order) => {
          const when = order.finalizedAt || order.deliveredAt || order.updatedAt || order.createdAt;
          return (
            <article
              key={order.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-white font-black text-sm">#{order.orderNumber}</p>
                  <p className="text-zinc-300 text-sm">{order.customerName}</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase px-2.5 py-1 border border-emerald-500/30">
                  Finalizado
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-zinc-600 uppercase text-[10px] font-bold">Data</p>
                  <p className="text-zinc-300">{fmtDate(when)}</p>
                </div>
                <div>
                  <p className="text-zinc-600 uppercase text-[10px] font-bold">Hora</p>
                  <p className="text-zinc-300">{fmtTime(when)}</p>
                </div>
                <div>
                  <p className="text-zinc-600 uppercase text-[10px] font-bold">Valor</p>
                  <p className="text-amber-400 font-bold">{fmtMoney(order.total)}</p>
                </div>
                <div>
                  <p className="text-zinc-600 uppercase text-[10px] font-bold">Pagamento</p>
                  <p className="text-zinc-300">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</p>
                </div>
                <div>
                  <p className="text-zinc-600 uppercase text-[10px] font-bold">Entregador</p>
                  <p className="text-zinc-300">{order.deliveryPersonName || "—"}</p>
                </div>
                <div>
                  <p className="text-zinc-600 uppercase text-[10px] font-bold">Preparo</p>
                  <p className="text-zinc-300">{fmtDuration(order.prepDurationSeconds)}</p>
                </div>
                <div>
                  <p className="text-zinc-600 uppercase text-[10px] font-bold">Entrega</p>
                  <p className="text-zinc-300">{fmtDuration(order.deliveryDurationSeconds)}</p>
                </div>
              </div>
            </article>
          );
        })}
      </main>

      <AdminBottomNav active="/admin/pedidos" />
    </div>
  );
}
