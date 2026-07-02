import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdmin } from '../../context/AdminContext';
import {
  getOrders, updateOrderStatus,
  Order, OrderStatus,
  STATUS_LABELS, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS,
} from '../../lib/api';
import {
  LayoutDashboard, UtensilsCrossed, LogOut, Bell,
  Printer, ChevronDown, ChevronUp, Clock, CheckCircle2,
  Bike, ChefHat, XCircle, Tag, MapPin, Navigation, Settings, Route, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS_TABS: Array<{ key: OrderStatus; label: string; icon: React.ReactNode; color: string }> = [
  { key: 'new', label: 'Novos', icon: <Bell size={16} />, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { key: 'preparing', label: 'Em Preparo', icon: <ChefHat size={16} />, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { key: 'delivery', label: 'Entrega', icon: <Bike size={16} />, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  { key: 'done', label: 'Finalizados', icon: <CheckCircle2 size={16} />, color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  { key: 'cancelled', label: 'Cancelados', icon: <XCircle size={16} />, color: 'text-red-400 bg-red-500/10 border-red-500/30' },
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  new: 'preparing',
  preparing: 'delivery',
  delivery: 'done',
};

const NEXT_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  new: 'Iniciar Preparo',
  preparing: 'Saiu p/ Entrega',
  delivery: 'Finalizar',
};

function fmt(val: string) { return `R$ ${parseFloat(val).toFixed(2).replace('.', ',')}` }

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.24);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch { /* ignore */ }
}

function buildReceiptHTML(order: Order): string {
  const orderTypeMap = ORDER_TYPE_LABELS;
  const paymentMap = PAYMENT_METHOD_LABELS;
  const items = order.items.map(i =>
    `<tr><td>${i.quantity}x ${i.productName}</td><td style="text-align:right">${fmt(i.subtotal)}</td></tr>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pedido #${order.orderNumber}</title>
  <style>
    body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 10px; }
    h1 { text-align: center; font-size: 14px; border-bottom: 1px dashed #000; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td { padding: 2px 0; }
    .total { font-weight: bold; border-top: 1px dashed #000; padding-top: 4px; }
    .footer { text-align: center; margin-top: 10px; font-size: 10px; }
  </style></head><body>
  <h1>THE BURGER GN<br>Pedido #${order.orderNumber}</h1>
  <p><b>Cliente:</b> ${order.customerName}<br>
  <b>Tel:</b> ${order.phone}<br>
  <b>Tipo:</b> ${orderTypeMap[order.orderType]}<br>
  ${order.orderType === 'delivery' ? `<b>End.:</b> ${order.address}, ${order.neighborhood}<br>` : ''}
  ${order.reference ? `<b>Ref.:</b> ${order.reference}<br>` : ''}
  <b>Pagamento:</b> ${paymentMap[order.paymentMethod]}
  ${order.changeFor ? ` (troco p/ ${fmt(order.changeFor)})` : ''}</p>
  <table>${items}</table>
  <table class="total">
    <tr><td>Subtotal</td><td style="text-align:right">${fmt(order.subtotal)}</td></tr>
    <tr><td>Entrega</td><td style="text-align:right">${parseFloat(order.deliveryFee) > 0 ? fmt(order.deliveryFee) : 'Grátis'}</td></tr>
    <tr><td><b>TOTAL</b></td><td style="text-align:right"><b>${fmt(order.total)}</b></td></tr>
  </table>
  ${order.notes ? `<p><b>Obs.:</b> ${order.notes}</p>` : ''}
  <div class="footer">${new Date(order.createdAt).toLocaleString('pt-BR')}</div>
  <script>window.onload=()=>{window.print();window.close();}</script>
  </body></html>`;
}

function handlePrint(order: Order) {
  const win = window.open('', '_blank', 'width=350,height=600');
  if (!win) return;
  win.document.write(buildReceiptHTML(order));
  win.document.close();
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'agora';
  if (diff < 60) return `${diff}min`;
  return `${Math.floor(diff / 60)}h`;
}

function OrderCard({ order, highlight, onStatusChange }: {
  order: Order; highlight: boolean; onStatusChange: (id: number, status: OrderStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const nextStatus = NEXT_STATUS[order.status];
  const [updating, setUpdating] = useState(false);

  const handleNext = async () => {
    if (!nextStatus) return;
    setUpdating(true);
    await onStatusChange(order.id, nextStatus);
    setUpdating(false);
  };

  const handleCancel = async () => {
    setUpdating(true);
    await onStatusChange(order.id, 'cancelled');
    setUpdating(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden transition-all ${
        highlight
          ? 'border-amber-500 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
          : 'border-zinc-800 bg-zinc-900'
      }`}
    >
      {/* Card header */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-500 font-black text-lg">#{order.orderNumber}</span>
            <span className="text-zinc-500 text-xs flex items-center gap-1">
              <Clock size={11} /> {timeAgo(order.createdAt)}
            </span>
            {highlight && (
              <span className="bg-amber-500 text-zinc-950 text-[9px] font-black uppercase px-1.5 py-0.5 rounded animate-pulse">NOVO</span>
            )}
          </div>
          <p className="text-white font-bold truncate">{order.customerName}</p>
          <p className="text-zinc-400 text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{ORDER_TYPE_LABELS[order.orderType]} · {PAYMENT_METHOD_LABELS[order.paymentMethod]}</span>
            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
              order.paymentStatus === 'paid' ? 'bg-green-500/15 text-green-400' :
              order.paymentStatus === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-zinc-700/40 text-zinc-400'
            }`}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
          </p>
          <p className="text-amber-500 font-bold mt-1">{fmt(order.total)}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button onClick={() => handlePrint(order)}
            className="p-2 text-zinc-500 hover:text-white bg-zinc-800 rounded-lg transition-colors" title="Imprimir">
            <Printer size={16} />
          </button>
          <button onClick={() => setExpanded(e => !e)}
            className="p-2 text-zinc-500 hover:text-white bg-zinc-800 rounded-lg transition-colors">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-zinc-800 pt-3">
              {/* Items */}
              <div className="space-y-1.5">
                {order.items.map(item => (
                  <div key={item.id} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-300">{item.quantity}x {item.productName}</span>
                      <span className="text-zinc-400">{fmt(item.subtotal)}</span>
                    </div>
                    {item.addons && item.addons.length > 0 && (
                      <p className="text-zinc-500 text-xs pl-4">+ {item.addons.map(a => a.name).join(', ')}</p>
                    )}
                    {item.notes && (
                      <p className="text-zinc-500 text-xs pl-4 italic">Obs: {item.notes}</p>
                    )}
                  </div>
                ))}
                <div className="border-t border-zinc-800 pt-1.5 flex justify-between text-sm font-bold text-white">
                  <span>Total</span><span className="text-amber-500">{fmt(order.total)}</span>
                </div>
              </div>

              {/* Address */}
              {order.orderType === 'delivery' && order.address && (
                <div className="bg-zinc-950 rounded-xl p-3 text-xs space-y-1">
                  <p className="text-zinc-300"><span className="text-zinc-500">End.:</span> {order.address}, {order.neighborhood}</p>
                  {order.reference && <p className="text-zinc-300"><span className="text-zinc-500">Ref.:</span> {order.reference}</p>}
                  {order.distanceKm && (
                    <p className="text-zinc-300 flex items-center gap-1"><Route size={12} className="text-amber-500" /> <span className="text-zinc-500">Distância:</span> {parseFloat(order.distanceKm).toFixed(1)} km</p>
                  )}
                  <p className="text-zinc-300"><span className="text-zinc-500">Taxa de entrega:</span> {parseFloat(order.deliveryFee) > 0 ? fmt(order.deliveryFee) : 'Grátis'}</p>
                </div>
              )}

              {/* Notes */}
              {order.notes && (
                <div className="bg-zinc-950 rounded-xl p-3 text-xs">
                  <span className="text-zinc-500">Obs.: </span><span className="text-zinc-300">{order.notes}</span>
                </div>
              )}

              {/* Phone */}
              <p className="text-zinc-500 text-xs">
                Tel: <a href={`tel:${order.phone}`} className="text-zinc-300 hover:text-amber-500">{order.phone}</a>
              </p>

              {/* Tracking link */}
              <a href={`/pedido/${order.trackingId}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-zinc-600 hover:text-amber-500 underline block">
                Link de rastreamento
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      {order.status !== 'done' && order.status !== 'cancelled' && (
        <div className="px-4 pb-4 flex gap-2">
          {nextStatus && (
            <Button size="sm" disabled={updating} onClick={handleNext}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs h-9 rounded-xl">
              {updating ? '...' : NEXT_STATUS_LABEL[order.status]}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={updating} onClick={handleCancel}
            className="border-red-800 text-red-400 hover:bg-red-900/30 font-bold text-xs h-9 rounded-xl px-3">
            Cancelar
          </Button>
        </div>
      )}
    </motion.div>
  );
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { logout } = useAdmin();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<OrderStatus>('new');
  const [newOrderIds, setNewOrderIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await getOrders();
      setOrders(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOrders();
    // SSE connection
    const es = new EventSource('/api/orders/stream', { withCredentials: true });
    esRef.current = es;

    es.addEventListener('new_order', (e) => {
      const order = JSON.parse(e.data) as Order;
      playBeep();
      setOrders(prev => [order, ...prev]);
      setNewOrderIds(prev => new Set([...prev, order.id]));
      setActiveTab('new');
      setNotification(`Novo pedido #${order.orderNumber} de ${order.customerName}!`);
      setTimeout(() => setNotification(null), 6000);
    });

    es.addEventListener('order_status', (e) => {
      const { id, status } = JSON.parse(e.data) as { id: number; status: OrderStatus };
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    });

    return () => es.close();
  }, [fetchOrders]);

  const handleStatusChange = async (id: number, status: OrderStatus) => {
    try {
      await updateOrderStatus(id, status);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      setNewOrderIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    } catch { /* ignore */ }
  };

  const handleLogout = async () => { await logout(); setLocation('/'); };

  const filtered = orders.filter(o => o.status === activeTab);
  const newCount = orders.filter(o => o.status === 'new').length;
  const todayTotal = orders
    .filter(o => o.status === 'done' && new Date(o.createdAt).toDateString() === new Date().toDateString())
    .reduce((acc, o) => acc + parseFloat(o.total), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Top notification banner */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }}
            className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-zinc-950 text-center font-bold text-sm py-3 px-4 shadow-lg"
          >
            🔔 {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border-2 border-amber-500 rounded-full flex items-center justify-center shrink-0">
              <span className="text-amber-500 font-black text-xs">GN</span>
            </div>
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Painel Admin</h1>
              <p className="text-zinc-600 text-xs">The Burger GN</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/cardapio">
              <button className="p-2 text-zinc-400 hover:text-amber-500 transition-colors" title="Cardápio">
                <UtensilsCrossed size={20} />
              </button>
            </Link>
            <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors" title="Sair">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-amber-500">{newCount}</p>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mt-0.5">Novos</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-white">{orders.filter(o => ['new','preparing','delivery'].includes(o.status)).length}</p>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mt-0.5">Em aberto</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <p className="text-lg font-black text-green-400">R${todayTotal.toFixed(2).replace('.',',')}</p>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mt-0.5">Hoje</p>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {STATUS_TABS.map(tab => {
            const count = orders.filter(o => o.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all shrink-0 ${
                  activeTab === tab.key ? tab.color : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'
                }`}
              >
                {tab.icon} {tab.label}
                {count > 0 && <span className="ml-1 bg-current text-zinc-950 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Orders list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Bell size={48} className="text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-600 font-medium">Nenhum pedido aqui.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filtered.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  highlight={newOrderIds.has(order.id)}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
        <div className="max-w-2xl mx-auto flex">
          <Link href="/admin" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-amber-500">
              <LayoutDashboard size={18} />
              <span className="text-[9px] font-bold uppercase">Pedidos</span>
            </div>
          </Link>
          <Link href="/admin/cardapio" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <UtensilsCrossed size={18} />
              <span className="text-[9px] font-bold uppercase">Cardápio</span>
            </div>
          </Link>
          <Link href="/admin/cupons" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Tag size={18} />
              <span className="text-[9px] font-bold uppercase">Cupons</span>
            </div>
          </Link>
          <Link href="/admin/taxas" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <MapPin size={18} />
              <span className="text-[9px] font-bold uppercase">Bairros</span>
            </div>
          </Link>
          <Link href="/admin/entrega-km" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Navigation size={18} />
              <span className="text-[9px] font-bold uppercase">Por KM</span>
            </div>
          </Link>
          <Link href="/admin/config" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Settings size={18} />
              <span className="text-[9px] font-bold uppercase">Config</span>
            </div>
          </Link>
          <Link href="/admin/importar" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Upload size={18} />
              <span className="text-[9px] font-bold uppercase">Importar</span>
            </div>
          </Link>
        </div>
      </nav>
    </div>
  );
}
