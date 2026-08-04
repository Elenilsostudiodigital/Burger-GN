import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useAdmin } from '../../context/AdminContext';
import {
  getOrders, updateOrderStatus, normalizePhoneForWhatsapp,
  Order, OrderStatus,
  ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS,
} from '../../lib/api';
import {
  LayoutDashboard, UtensilsCrossed, LogOut, Bell, BellOff,
  Printer, Clock, CheckCircle2, MessageCircle,
  Bike, ChefHat, XCircle, Tag, MapPin, Navigation, Settings, Route, Upload, TrendingUp,
  ChevronLeft, ChevronRight, GripVertical, Ban, X, Crown,
} from 'lucide-react';

type ColumnStatus = 'new' | 'preparing' | 'delivery' | 'done';

interface ColumnDef {
  key: ColumnStatus;
  label: string;
  emoji: string;
  headerClass: string;
  badgeClass: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'new', label: 'Pedido Novo', emoji: '🟡', headerClass: 'border-amber-500/40 bg-amber-500/[0.06]', badgeClass: 'bg-amber-500 text-zinc-950' },
  { key: 'preparing', label: 'Em Preparação', emoji: '🟠', headerClass: 'border-orange-500/40 bg-orange-500/[0.06]', badgeClass: 'bg-orange-500 text-zinc-950' },
  { key: 'delivery', label: 'Pedido Pronto', emoji: '🟢', headerClass: 'border-green-500/40 bg-green-500/[0.06]', badgeClass: 'bg-green-500 text-zinc-950' },
  { key: 'done', label: 'Finalizado', emoji: '⚫', headerClass: 'border-zinc-600/40 bg-zinc-600/[0.06]', badgeClass: 'bg-zinc-500 text-zinc-950' },
];

const COLUMN_ORDER: ColumnStatus[] = ['new', 'preparing', 'delivery', 'done'];

const SOUND_STORAGE_KEY = 'admin_sound_enabled';

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

function buildWhatsAppMessage(order: Order): string {
  return `Olá ${order.customerName}! Aqui é da The Burger GN sobre seu pedido #${order.orderNumber}.`;
}

function handleWhatsApp(order: Order) {
  const number = normalizePhoneForWhatsapp(order.phone);
  if (!number) return;
  const url = `https://wa.me/${number}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`;
  window.open(url, '_blank');
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'agora';
  if (diff < 60) return `${diff}min`;
  return `${Math.floor(diff / 60)}h`;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function OrderCard({ order, highlight, dragging, onStatusChange }: {
  order: Order; highlight: boolean; dragging?: boolean;
  onStatusChange: (id: number, status: OrderStatus) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const colIndex = COLUMN_ORDER.indexOf(order.status as ColumnStatus);
  const prevStatus = colIndex > 0 ? COLUMN_ORDER[colIndex - 1] : null;
  const nextStatus = colIndex >= 0 && colIndex < COLUMN_ORDER.length - 1 ? COLUMN_ORDER[colIndex + 1] : null;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `order-${order.id}`,
    data: { orderId: order.id, status: order.status },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const move = async (status: OrderStatus) => {
    setUpdating(true);
    await onStatusChange(order.id, status);
    setUpdating(false);
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: isDragging ? 0.3 : 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden transition-colors touch-none ${
        highlight
          ? 'border-amber-500 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
          : 'border-zinc-800 bg-zinc-900'
      } ${dragging ? 'shadow-2xl ring-2 ring-amber-500/60' : ''}`}
    >
      {/* Header */}
      <div className="p-3 pb-2 flex items-start gap-2">
        <button
          {...attributes} {...listeners}
          className="mt-0.5 p-1.5 -ml-1 text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          title="Arrastar"
        >
          <GripVertical size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-amber-500 font-black text-lg">#{order.orderNumber}</span>
            <span className="text-zinc-500 text-xs flex items-center gap-1">
              <Clock size={11} /> {formatTime(order.createdAt)} · {timeAgo(order.createdAt)}
            </span>
            {highlight && (
              <span className="bg-amber-500 text-zinc-950 text-[9px] font-black uppercase px-1.5 py-0.5 rounded animate-pulse">NOVO</span>
            )}
          </div>
          <p className="text-white font-bold truncate">{order.customerName}</p>
        </div>
      </div>

      {/* Type / payment badges */}
      <div className="px-3 flex items-center gap-1.5 flex-wrap text-[10px]">
        <span className="font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {ORDER_TYPE_LABELS[order.orderType]}
        </span>
        <span className="font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {PAYMENT_METHOD_LABELS[order.paymentMethod]}
        </span>
        <span className={`font-black uppercase px-1.5 py-0.5 rounded ${
          order.paymentStatus === 'paid' ? 'bg-green-500/15 text-green-400' :
          order.paymentStatus === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-zinc-700/40 text-zinc-400'
        }`}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
      </div>

      {/* Items */}
      <div className="px-3 mt-2 space-y-1">
        {order.items.map(item => (
          <div key={item.id} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-zinc-300">{item.quantity}x {item.productName}</span>
              <span className="text-zinc-500 shrink-0">{fmt(item.subtotal)}</span>
            </div>
            {item.addons && item.addons.length > 0 && (
              <p className="text-zinc-500 text-[11px] pl-3">+ {item.addons.map(a => a.name).join(', ')}</p>
            )}
            {item.notes && (
              <p className="text-zinc-500 text-[11px] pl-3 italic">Obs: {item.notes}</p>
            )}
          </div>
        ))}
      </div>

      {/* Order-level notes */}
      {order.notes && (
        <div className="mx-3 mt-2 bg-zinc-950 rounded-lg p-2 text-[11px]">
          <span className="text-zinc-500">Obs.: </span><span className="text-zinc-300">{order.notes}</span>
        </div>
      )}

      {/* Address */}
      {order.orderType === 'delivery' && order.address && (
        <div className="mx-3 mt-2 bg-zinc-950 rounded-lg p-2 text-[11px] space-y-0.5">
          <p className="text-zinc-300 flex items-start gap-1"><MapPin size={11} className="text-amber-500 mt-0.5 shrink-0" /> {order.address}{order.addressNumber ? `, ${order.addressNumber}` : ''} — {order.neighborhood}</p>
          {order.reference && <p className="text-zinc-500 pl-4">Ref.: {order.reference}</p>}
          {order.distanceKm && (
            <p className="text-zinc-500 pl-4 flex items-center gap-1"><Route size={10} /> {parseFloat(order.distanceKm).toFixed(1)} km</p>
          )}
        </div>
      )}

      {/* Total */}
      <div className="px-3 mt-2 flex items-center justify-between">
        <span className="text-zinc-500 text-xs">Total</span>
        <span className="text-amber-500 font-black text-base">{fmt(order.total)}</span>
      </div>

      {/* Actions */}
      <div className="p-3 pt-2 flex items-center gap-1.5">
        <button onClick={() => handleWhatsApp(order)}
          className="p-2 bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 rounded-lg transition-colors" title="WhatsApp">
          <MessageCircle size={15} />
        </button>
        <button onClick={() => handlePrint(order)}
          className="p-2 text-zinc-500 hover:text-white bg-zinc-800 rounded-lg transition-colors" title="Imprimir">
          <Printer size={15} />
        </button>
        {order.status !== 'cancelled' && (
          <button onClick={() => move('cancelled')} disabled={updating}
            className="p-2 text-red-500/70 hover:text-red-400 bg-red-950/30 rounded-lg transition-colors" title="Cancelar pedido">
            <Ban size={15} />
          </button>
        )}
        <div className="flex-1" />
        {prevStatus && (
          <button onClick={() => move(prevStatus)} disabled={updating}
            className="p-2 text-zinc-500 hover:text-white bg-zinc-800 rounded-lg transition-colors" title={`Voltar para ${COLUMNS.find(c => c.key === prevStatus)?.label}`}>
            <ChevronLeft size={15} />
          </button>
        )}
        {nextStatus && (
          <button onClick={() => move(nextStatus)} disabled={updating}
            className="p-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg transition-colors font-bold" title={`Avançar para ${COLUMNS.find(c => c.key === nextStatus)?.label}`}>
            <ChevronRight size={15} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Column({ col, orders, newOrderIds, onStatusChange }: {
  col: ColumnDef; orders: Order[]; newOrderIds: Set<number>;
  onStatusChange: (id: number, status: OrderStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });

  return (
    <div className="flex flex-col shrink-0 w-[320px] sm:w-[340px] h-full">
      <div className={`rounded-t-2xl border border-b-0 px-4 py-3 flex items-center justify-between sticky top-0 z-10 ${col.headerClass}`}>
        <div className="flex items-center gap-2">
          <span>{col.emoji}</span>
          <h2 className="text-white font-black uppercase text-sm tracking-wide">{col.label}</h2>
        </div>
        <span className={`text-xs font-black w-6 h-6 rounded-full flex items-center justify-center ${col.badgeClass}`}>
          {orders.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 border border-t-0 rounded-b-2xl p-3 space-y-3 overflow-y-auto min-h-[200px] transition-colors ${
          isOver ? 'bg-amber-500/[0.08] border-amber-500/40' : 'border-zinc-800 bg-zinc-950/40'
        }`}
      >
        <AnimatePresence mode="popLayout">
          {orders.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-zinc-700 text-xs font-medium">Nenhum pedido aqui.</p>
            </div>
          ) : (
            orders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                highlight={newOrderIds.has(order.id)}
                onStatusChange={onStatusChange}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { logout } = useAdmin();
  const [orders, setOrders] = useState<Order[]>([]);
  const [newOrderIds, setNewOrderIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeDragOrder, setActiveDragOrder] = useState<Order | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(SOUND_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });
  const soundEnabledRef = useRef(soundEnabled);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const toggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem(SOUND_STORAGE_KEY, String(next));
      return next;
    });
  };

  const fetchOrders = useCallback(async () => {
    try {
      const data = await getOrders();
      setOrders(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOrders();
    const es = new EventSource('/api/orders/stream', { withCredentials: true });
    esRef.current = es;

    es.addEventListener('new_order', (e) => {
      const order = JSON.parse(e.data) as Order;
      if (soundEnabledRef.current) playBeep();
      setOrders(prev => [order, ...prev]);
      setNewOrderIds(prev => new Set([...prev, order.id]));
      setNotification(`Novo pedido #${order.orderNumber} de ${order.customerName}!`);
      setTimeout(() => setNotification(null), 6000);
      setTimeout(() => setNewOrderIds(prev => { const s = new Set(prev); s.delete(order.id); return s; }), 30000);
    });

    es.addEventListener('order_status', (e) => {
      const { id, status } = JSON.parse(e.data) as { id: number; status: OrderStatus };
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    });

    return () => es.close();
  }, [fetchOrders]);

  const handleStatusChange = async (id: number, status: OrderStatus) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    setNewOrderIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    try {
      await updateOrderStatus(id, status);
    } catch {
      fetchOrders();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const orderId = event.active.data.current?.orderId as number | undefined;
    const order = orders.find(o => o.id === orderId) ?? null;
    setActiveDragOrder(order);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragOrder(null);
    const { active, over } = event;
    if (!over) return;
    const orderId = active.data.current?.orderId as number | undefined;
    const fromStatus = active.data.current?.status as OrderStatus | undefined;
    const toStatus = over.id as ColumnStatus;
    if (!orderId || !fromStatus || !COLUMN_ORDER.includes(toStatus) || toStatus === fromStatus) return;
    handleStatusChange(orderId, toStatus);
  };

  const handleLogout = async () => { await logout(); setLocation('/'); };

  const ordersByColumn = useMemo(() => {
    const map: Record<ColumnStatus, Order[]> = { new: [], preparing: [], delivery: [], done: [] };
    for (const o of orders) {
      if (o.status in map) map[o.status as ColumnStatus].push(o);
    }
    return map;
  }, [orders]);

  const cancelledOrders = useMemo(() => orders.filter(o => o.status === 'cancelled'), [orders]);
  const newCount = ordersByColumn.new.length;
  const todayTotal = orders
    .filter(o => o.status === 'done' && new Date(o.createdAt).toDateString() === new Date().toDateString())
    .reduce((acc, o) => acc + parseFloat(o.total), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
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
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 border-2 border-amber-500 rounded-full flex items-center justify-center shrink-0">
              <span className="text-amber-500 font-black text-xs">GN</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-white font-black uppercase text-base leading-none truncate">Painel de Operação</h1>
              <p className="text-zinc-600 text-xs">The Burger GN</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs">
            <div className="text-center px-3">
              <p className="text-lg font-black text-amber-500 leading-none">{newCount}</p>
              <p className="text-zinc-600 text-[9px] uppercase tracking-wider mt-0.5">Novos</p>
            </div>
            <div className="text-center px-3 border-l border-zinc-800">
              <p className="text-lg font-black text-green-400 leading-none">R${todayTotal.toFixed(2).replace('.', ',')}</p>
              <p className="text-zinc-600 text-[9px] uppercase tracking-wider mt-0.5">Hoje</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setShowCancelled(true)}
              className="p-2 text-zinc-400 hover:text-red-400 transition-colors relative" title="Pedidos cancelados">
              <XCircle size={20} />
              {cancelledOrders.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {cancelledOrders.length}
                </span>
              )}
            </button>
            <button onClick={toggleSound}
              className={`p-2 transition-colors ${soundEnabled ? 'text-amber-500' : 'text-zinc-600'}`}
              title={soundEnabled ? 'Desativar som de notificação' : 'Ativar som de notificação'}>
              {soundEnabled ? <Bell size={20} /> : <BellOff size={20} />}
            </button>
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

        {/* Mobile stats row */}
        <div className="sm:hidden flex gap-3 mt-2 text-xs">
          <span className="text-amber-500 font-black">{newCount} novos</span>
          <span className="text-zinc-700">·</span>
          <span className="text-green-400 font-black">R${todayTotal.toFixed(2).replace('.', ',')} hoje</span>
        </div>
      </header>

      {/* Kanban board */}
      <main className="flex-1 px-4 py-5 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="max-w-[1600px] mx-auto h-full flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 220px)' }}>
              {COLUMNS.map(col => (
                <Column
                  key={col.key}
                  col={col}
                  orders={ordersByColumn[col.key]}
                  newOrderIds={newOrderIds}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
            <DragOverlay>
              {activeDragOrder && (
                <div className="w-[320px] rotate-2">
                  <OrderCard order={activeDragOrder} highlight={false} dragging onStatusChange={handleStatusChange} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {/* Cancelled orders modal */}
      <AnimatePresence>
        {showCancelled && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowCancelled(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[80vh] overflow-y-auto p-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-black uppercase flex items-center gap-2">
                  <XCircle size={18} className="text-red-500" /> Pedidos Cancelados
                </h2>
                <button onClick={() => setShowCancelled(false)} className="p-2 text-zinc-500 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              {cancelledOrders.length === 0 ? (
                <p className="text-zinc-600 text-sm text-center py-10">Nenhum pedido cancelado.</p>
              ) : (
                <div className="space-y-3">
                  {cancelledOrders.map(order => (
                    <OrderCard key={order.id} order={order} highlight={false} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
        <div className="max-w-[1600px] mx-auto flex overflow-x-auto no-scrollbar">
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
          <Link href="/admin/financeiro" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <TrendingUp size={18} />
              <span className="text-[9px] font-bold uppercase">Financeiro</span>
            </div>
          </Link>

          <Link href="/admin/cupons" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Tag size={18} />
              <span className="text-[9px] font-bold uppercase">Cupons</span>
            </div>
          </Link>
          <Link href="/admin/clube" className="flex-1">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white transition-colors">
              <Crown size={18} />
              <span className="text-[9px] font-bold uppercase">Clube Burger</span>
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
