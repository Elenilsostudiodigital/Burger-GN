import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  trackOrder, getPaymentSettings, Order, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS,
} from '../lib/api';
import { getMyOrder, clearMyOrder, saveMyOrder } from '../lib/myOrder';
import { notifyOrderStatusChange } from '../lib/pushNotifications';
import { ArrowLeft, Clock, Home, AlertCircle, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageTransition } from '../components/PageTransition';
import { BottomNav } from '../components/BottomNav';
import { MyOrderFab } from '../components/MyOrderFab';

type TimelineKey = 'received' | 'accepted' | 'preparing' | 'ready' | 'out' | 'done';

const TIMELINE: Array<{ key: TimelineKey; label: string; emoji: string }> = [
  { key: 'received', label: 'Pedido Recebido', emoji: '🟡' },
  { key: 'accepted', label: 'Pedido Aceito', emoji: '🟠' },
  { key: 'preparing', label: 'Em Preparo', emoji: '👨‍🍳' },
  { key: 'ready', label: 'Pedido Pronto', emoji: '🍔' },
  { key: 'out', label: 'Saiu para Entrega', emoji: '🛵' },
  { key: 'done', label: 'Pedido Entregue', emoji: '✅' },
];

function resolveTimelineIndex(order: Order): number {
  if (order.status === 'cancelled') return -1;
  const wf = order.workflow === 'accepted' ? 'preparing' : order.workflow;
  if (wf === 'done' || order.status === 'done') return 5;
  if (wf === 'out' || order.status === 'delivery') return 4;
  if (wf === 'ready') return 3;
  if (wf === 'preparing') return 2; // Aceito + Em preparo: highlight Em Preparo
  return 0; // Pendente / new
}

function fmt(val: string) {
  return `R$ ${parseFloat(val).toFixed(2).replace('.', ',')}`;
}

function OrderTimelineView({ trackingId }: { trackingId: string }) {
  const [, setLocation] = useLocation();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState(false);
  const [prepMin, setPrepMin] = useState(35);
  const [prepMax, setPrepMax] = useState(45);
  const lastWorkflow = useRef<string | null>(null);

  useEffect(() => {
    getPaymentSettings()
      .then(s => {
        if (s.prepTimeMin) setPrepMin(s.prepTimeMin);
        if (s.prepTimeMax) setPrepMax(s.prepTimeMax);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const fetchOrder = async () => {
      try {
        const data = await trackOrder(trackingId);
        if (!alive) return;
        setOrder(data);
        setError(false);
        saveMyOrder({
          trackingId: data.trackingId,
          orderNumber: data.orderNumber,
          createdAt: data.createdAt,
        });

        const wf = data.status === 'cancelled' ? 'cancelled' : (data.workflow || data.status);
        if (lastWorkflow.current && lastWorkflow.current !== wf) {
          notifyOrderStatusChange({
            trackingId: data.trackingId,
            workflow: String(wf),
            title: `Pedido #${data.orderNumber}`,
            body: data.status === 'cancelled'
              ? `Pedido recusado${data.rejectReason ? `: ${data.rejectReason}` : ''}`
              : `Status atualizado: ${wf}`,
          });
        }
        lastWorkflow.current = String(wf);

        if (data.status === 'done' || data.status === 'cancelled') {
          // Keep ref so customer can still reopen history until they clear it.
        }
      } catch {
        if (alive) setError(true);
      }
    };
    fetchOrder();
    const interval = setInterval(fetchOrder, 8000);
    return () => { alive = false; clearInterval(interval); };
  }, [trackingId]);

  if (error) {
    return (
      <PageTransition className="bg-[#0a0a0a] min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="text-zinc-400 mb-4">Pedido não encontrado.</p>
        <Button onClick={() => { clearMyOrder(); setLocation('/cardapio'); }}>Voltar ao cardápio</Button>
        <BottomNav />
      </PageTransition>
    );
  }

  if (!order) {
    return (
      <PageTransition className="bg-[#0a0a0a]">
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    );
  }

  const cancelled = order.status === 'cancelled';
  const current = resolveTimelineIndex(order);
  const acceptedOrFurther = current >= 2;

  return (
    <PageTransition className="bg-[#0a0a0a]">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <button type="button" onClick={() => setLocation('/cardapio')}
            className="p-2 -ml-1 text-zinc-400 hover:text-white rounded-xl">
            <ArrowLeft size={22} />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500 font-bold">Meu Pedido</p>
            <h1 className="text-lg font-black text-white uppercase tracking-tight">#{order.orderNumber}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 pb-28 space-y-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 text-center">
          {cancelled ? (
            <>
              <p className="text-4xl mb-2">❌</p>
              <h2 className="text-red-400 font-black text-xl uppercase">Pedido Recusado</h2>
              {order.rejectReason && (
                <div className="mt-3 flex items-start gap-2 text-left bg-red-950/40 border border-red-900/50 rounded-xl px-3 py-2.5">
                  <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-red-200 text-sm"><span className="font-bold">Motivo: </span>{order.rejectReason}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Status atual</p>
              <h2 className="text-amber-400 font-black text-xl uppercase">
                {TIMELINE[Math.max(0, current)]?.emoji} {TIMELINE[Math.max(0, current)]?.label}
              </h2>
              <p className="text-zinc-600 text-xs mt-2 flex items-center justify-center gap-1">
                <Clock size={12} /> Atualiza automaticamente
              </p>
            </>
          )}
        </motion.div>

        {!cancelled && acceptedOrFurther && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-2">
            <p className="text-amber-300 font-bold text-sm">
              Seu pedido foi aceito e já está sendo preparado.
            </p>
            <div className="flex items-center gap-2 text-white font-black text-lg">
              <Timer size={20} className="text-amber-400" />
              Tempo estimado: {prepMin} a {prepMax} minutos
            </div>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Seu pedido poderá ficar pronto antes desse prazo. O tempo pode variar conforme o movimento da loja.
            </p>
          </motion.div>
        )}

        {!cancelled && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
            <h3 className="text-white font-black uppercase text-xs tracking-wider mb-5">Linha do tempo</h3>
            <div className="space-y-0">
              {TIMELINE.map((step, idx) => {
                const done = idx < current || (idx === current && current === 5);
                const active = idx === current && current < 5;
                // When preparing (index 2), mark accepted (1) as done/green too
                const completed = idx < current || (current >= 2 && idx === 1) || done;
                const isFuture = !completed && !active;

                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg border-2 transition-all ${
                        completed ? 'bg-emerald-500 border-emerald-400 text-zinc-950 shadow-[0_0_16px_rgba(16,185,129,0.35)]' :
                        active ? 'bg-amber-500 border-amber-300 text-zinc-950 scale-110 shadow-[0_0_20px_rgba(245,158,11,0.45)]' :
                        'bg-zinc-900 border-zinc-700 text-zinc-600'
                      }`}>
                        <span aria-hidden>{step.emoji}</span>
                      </div>
                      {idx < TIMELINE.length - 1 && (
                        <div className={`w-0.5 flex-1 min-h-[28px] my-1 ${
                          idx < current || (current >= 2 && idx === 0) ? 'bg-emerald-500' : 'bg-zinc-800'
                        }`} />
                      )}
                    </div>
                    <div className={`pt-2.5 pb-5 ${isFuture ? 'opacity-50' : ''}`}>
                      <p className={`font-black text-sm ${
                        active ? 'text-amber-400' : completed ? 'text-emerald-400' : 'text-zinc-500'
                      }`}>
                        {step.label}
                      </p>
                      {active && (
                        <p className="text-amber-500/80 text-xs mt-0.5 font-medium">Etapa atual</p>
                      )}
                      {completed && !active && (
                        <p className="text-emerald-600 text-xs mt-0.5">Concluído</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-3">
          <h3 className="text-white font-black uppercase text-xs tracking-wider">Resumo</h3>
          <div className="space-y-1.5">
            {order.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-zinc-300">{item.quantity}x {item.productName}</span>
                <span className="text-zinc-500">{fmt(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-zinc-800 pt-3 flex justify-between font-bold">
            <span className="text-white">Total</span>
            <span className="text-amber-500">{fmt(order.total)}</span>
          </div>
          <div className="text-xs text-zinc-500 space-y-1 pt-1">
            <div className="flex justify-between"><span>Tipo</span><span>{ORDER_TYPE_LABELS[order.orderType]}</span></div>
            <div className="flex justify-between items-center">
              <span>Pagamento</span>
              <span className="flex items-center gap-1.5">
                {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                  order.paymentStatus === 'paid' ? 'bg-green-500/15 text-green-400' : 'bg-zinc-700/40 text-zinc-400'
                }`}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
              </span>
            </div>
          </div>
        </motion.div>

        <Link href="/" className="block">
          <Button variant="ghost" className="w-full text-zinc-500 hover:text-white gap-2">
            <Home size={16} /> Voltar ao início
          </Button>
        </Link>
      </main>
      <BottomNav />
    </PageTransition>
  );
}

/** /meu-pedido — loads tracking id from localStorage */
export function MyOrderPage() {
  const [, setLocation] = useLocation();
  const ref = getMyOrder();

  if (!ref?.trackingId) {
    return (
      <PageTransition className="bg-[#0a0a0a]">
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center pb-28">
          <p className="text-4xl mb-3">🍔</p>
          <h1 className="text-white font-black text-2xl uppercase mb-2">Meu Pedido</h1>
          <p className="text-zinc-500 text-sm max-w-xs mb-6">
            Você ainda não tem um pedido em andamento. Faça um pedido no cardápio para acompanhar aqui.
          </p>
          <Button onClick={() => setLocation('/cardapio')} className="rounded-xl font-bold bg-amber-500 text-zinc-950">
            Ver cardápio
          </Button>
        </div>
        <BottomNav />
        <MyOrderFab />
      </PageTransition>
    );
  }

  return <OrderTimelineView trackingId={ref.trackingId} />;
}

export default function OrderTracking() {
  const { trackingId } = useParams<{ trackingId: string }>();
  if (!trackingId) return <MyOrderPage />;
  return <OrderTimelineView trackingId={trackingId} />;
}
