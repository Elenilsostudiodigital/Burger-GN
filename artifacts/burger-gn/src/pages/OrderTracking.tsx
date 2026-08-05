import React, { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import {
  trackOrder, Order, WORKFLOW_LABELS, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS,
  WorkflowStage,
} from "../lib/api";
import { CheckCircle2, Clock, ChefHat, Bike, Home, Package, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type TrackStep = WorkflowStage | "cancelled";

const STEPS: Array<{ key: Exclude<TrackStep, "cancelled" | "accepted">; label: string; icon: React.ReactNode }> = [
  { key: "new", label: "Pendente", icon: <Package size={22} /> },
  { key: "preparing", label: "Em Preparo", icon: <ChefHat size={22} /> },
  { key: "ready", label: "Pronto", icon: <Sparkles size={22} /> },
  { key: "out", label: "Saiu p/ Entrega", icon: <Bike size={22} /> },
  { key: "done", label: "Entregue", icon: <CheckCircle2 size={22} /> },
];

const STEP_ORDER: Record<string, number> = {
  new: 0, accepted: 1, preparing: 1, ready: 2, out: 3, done: 4, cancelled: -1,
};

function fmt(val: string) {
  return `R$ ${parseFloat(val).toFixed(2).replace(".", ",")}`;
}

function resolveTrackWorkflow(order: Order): TrackStep {
  if (order.status === "cancelled") return "cancelled";
  if (order.workflow === "accepted") return "preparing";
  if (order.workflow && order.workflow !== "cancelled") return order.workflow;
  if (order.status === "preparing") return "preparing";
  if (order.status === "delivery") return "out";
  if (order.status === "done") return "done";
  return "new";
}

export default function OrderTracking() {
  const { trackingId } = useParams<{ trackingId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState(false);

  const fetchOrder = async () => {
    try {
      const data = await trackOrder(trackingId!);
      setOrder(data);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 10000);
    return () => clearInterval(interval);
  }, [trackingId]);

  if (error) return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-center">
      <p className="text-zinc-400 mb-4">Pedido não encontrado.</p>
      <Link href="/"><Button>Voltar ao início</Button></Link>
    </div>
  );

  if (!order) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const workflow = resolveTrackWorkflow(order);
  const cancelled = workflow === "cancelled";
  const currentStep = STEP_ORDER[workflow] ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-12">
      <header className="bg-zinc-950 border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 border-2 border-amber-500 rounded-full flex items-center justify-center">
          <span className="text-amber-500 font-black text-xs">GN</span>
        </div>
        <div>
          <h1 className="text-white font-black uppercase tracking-tight text-lg leading-none">The Burger GN</h1>
          <p className="text-zinc-500 text-xs">Acompanhar Pedido</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center"
        >
          <p className="text-zinc-500 text-sm uppercase tracking-wider mb-1">Pedido</p>
          <h2 className="text-amber-500 font-black text-5xl mb-3">#{order.orderNumber}</h2>
          {cancelled ? (
            <span className="inline-block bg-red-900/40 text-red-400 border border-red-800 rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-wider">
              Recusado
            </span>
          ) : (
            <span className="inline-block bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-wider">
              {WORKFLOW_LABELS[workflow === "accepted" ? "preparing" : workflow]}
            </span>
          )}
          {cancelled && order.rejectReason && (
            <div className="mt-4 flex items-start gap-2 text-left bg-red-950/30 border border-red-900/40 rounded-xl px-3 py-2.5">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-300 text-sm">
                <span className="font-bold">Motivo: </span>{order.rejectReason}
              </p>
            </div>
          )}
          <p className="text-zinc-600 text-xs mt-3 flex items-center justify-center gap-1">
            <Clock size={12} /> Atualiza automaticamente a cada 10s
          </p>
        </motion.div>

        {!cancelled && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6"
          >
            <div className="flex flex-col gap-0">
              {STEPS.map((step, idx) => {
                const done = idx <= currentStep;
                const active = idx === currentStep;
                return (
                  <div key={step.key} className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                        done ? "bg-amber-500 border-amber-500 text-zinc-950" :
                        active ? "border-amber-500 text-amber-500" :
                        "border-zinc-700 text-zinc-600"
                      }`}>
                        {step.icon}
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div className={`w-0.5 h-10 mt-0.5 ${idx < currentStep ? "bg-amber-500" : "bg-zinc-800"}`} />
                      )}
                    </div>
                    <div className="pt-2 pb-6">
                      <p className={`font-bold text-sm ${done ? "text-white" : "text-zinc-600"}`}>{step.label}</p>
                      {active && (
                        <p className="text-amber-500 text-xs mt-0.5">
                          {step.key === "new"
                            ? "Aguardando a loja aceitar o pedido..."
                            : "Em andamento..."}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4"
        >
          <h3 className="text-white font-bold uppercase tracking-wider text-sm">Resumo do Pedido</h3>
          <div className="space-y-2">
            {order.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-zinc-300">{item.quantity}x {item.productName}</span>
                <span className="text-zinc-400">{fmt(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-zinc-800 pt-3 space-y-1.5">
            <div className="flex justify-between text-sm text-zinc-400">
              <span>Subtotal</span><span>{fmt(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-zinc-400">
              <span>Entrega</span>
              <span>{parseFloat(order.deliveryFee) > 0 ? fmt(order.deliveryFee) : "Grátis"}</span>
            </div>
            <div className="flex justify-between font-bold text-white">
              <span>Total</span><span className="text-amber-500">{fmt(order.total)}</span>
            </div>
          </div>
          <div className="border-t border-zinc-800 pt-3 space-y-1 text-xs text-zinc-500">
            <div className="flex justify-between">
              <span>Tipo</span><span>{ORDER_TYPE_LABELS[order.orderType]}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Pagamento</span>
              <span className="flex items-center gap-1.5">
                {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                  order.paymentStatus === 'paid' ? 'bg-green-500/15 text-green-400' :
                  order.paymentStatus === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-zinc-700/40 text-zinc-400'
                }`}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
              </span>
            </div>
            {order.address && (
              <div className="flex justify-between">
                <span>Endereço</span><span className="text-right max-w-[200px]">{order.address}, {order.neighborhood}</span>
              </div>
            )}
            {order.notes && (
              <div className="flex justify-between">
                <span>Obs.</span><span className="text-right max-w-[200px]">{order.notes}</span>
              </div>
            )}
          </div>
        </motion.div>

        <Link href="/" className="block">
          <Button variant="ghost" className="w-full text-zinc-500 hover:text-white gap-2">
            <Home size={16} /> Voltar ao início
          </Button>
        </Link>
      </main>
    </div>
  );
}
