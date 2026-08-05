import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useAdmin } from '../../context/AdminContext';
import {
  getOrders, updateOrderWorkflow, updateOrderPaymentStatus, normalizePhoneForWhatsapp,
  Order, WorkflowStage, PaymentStatus,
  ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, CARD_TYPE_LABELS, WORKFLOW_LABELS,
} from '../../lib/api';
import {
  LayoutDashboard, UtensilsCrossed, LogOut, Bell, BellOff,
  Printer, Clock, MessageCircle, History,
  XCircle, Tag, MapPin, Navigation, Settings, Route, Upload, TrendingUp,
  ChevronLeft, ChevronRight, GripVertical, Ban, X, Crown, Filter, ImageIcon, CheckCircle2,
} from 'lucide-react';

type ColumnKey = WorkflowStage;

interface ColumnDef {
  key: ColumnKey;
  label: string;
  headerClass: string;
  badgeClass: string;
  btnClass: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'new', label: 'Novo Pedido', headerClass: 'border-amber-500/40 bg-amber-500/[0.07]', badgeClass: 'bg-amber-500 text-zinc-950', btnClass: 'bg-amber-500 text-zinc-950' },
  { key: 'accepted', label: 'Pedido Aceito', headerClass: 'border-sky-500/40 bg-sky-500/[0.07]', badgeClass: 'bg-sky-500 text-zinc-950', btnClass: 'bg-sky-500 text-zinc-950' },
  { key: 'preparing', label: 'Em Preparo', headerClass: 'border-orange-500/40 bg-orange-500/[0.07]', badgeClass: 'bg-orange-500 text-zinc-950', btnClass: 'bg-orange-500 text-zinc-950' },
  { key: 'ready', label: 'Pronto', headerClass: 'border-emerald-500/40 bg-emerald-500/[0.07]', badgeClass: 'bg-emerald-500 text-zinc-950', btnClass: 'bg-emerald-500 text-zinc-950' },
  { key: 'out', label: 'Saiu para Entrega', headerClass: 'border-violet-500/40 bg-violet-500/[0.07]', badgeClass: 'bg-violet-500 text-zinc-950', btnClass: 'bg-violet-500 text-zinc-950' },
  { key: 'done', label: 'Finalizado', headerClass: 'border-zinc-500/40 bg-zinc-600/[0.07]', badgeClass: 'bg-zinc-500 text-zinc-950', btnClass: 'bg-zinc-600 text-white' },
];

const COLUMN_ORDER: ColumnKey[] = COLUMNS.map(c => c.key);
const SOUND_STORAGE_KEY = 'admin_sound_enabled';

function fmt(val: string) { return `R$ ${parseFloat(val).toFixed(2).replace('.', ',')}` }
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'agora';
  if (diff < 60) return `${diff}min`;
  return `${Math.floor(diff / 60)}h`;
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    playTone(880, 0, 0.18);
    playTone(1175, 0.16, 0.22);
    playTone(988, 0.36, 0.28);
  } catch { /* ignore */ }
}

function getWorkflow(order: Order): WorkflowStage | 'cancelled' {
  if (order.status === 'cancelled') return 'cancelled';
  if (order.workflow && order.workflow !== 'cancelled') return order.workflow;
  if (order.status === 'preparing') return 'preparing';
  if (order.status === 'delivery') return 'out';
  if (order.status === 'done') return 'done';
  return 'new';
}

function buildReceiptHTML(order: Order): string {
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
  </style></head><body>
  <h1>THE BURGER GN<br>Pedido #${order.orderNumber}</h1>
  <p><b>Cliente:</b> ${order.customerName}<br>
  <b>Tel:</b> ${order.phone}<br>
  <b>Tipo:</b> ${ORDER_TYPE_LABELS[order.orderType]}<br>
  ${order.orderType === 'delivery' ? `<b>End.:</b> ${order.address}, ${order.neighborhood}<br>` : ''}
  <b>Pagamento:</b> ${PAYMENT_METHOD_LABELS[order.paymentMethod]}
  ${order.cardType ? ` (${CARD_TYPE_LABELS[order.cardType]})` : ''}
  ${order.changeFor ? ` (troco p/ ${fmt(order.changeFor)})` : ''}</p>
  <table>${items}</table>
  <table class="total">
    <tr><td>Subtotal</td><td style="text-align:right">${fmt(order.subtotal)}</td></tr>
    <tr><td>Entrega</td><td style="text-align:right">${parseFloat(order.deliveryFee) > 0 ? fmt(order.deliveryFee) : 'Grátis'}</td></tr>
    ${parseFloat(order.discountAmount) > 0 ? `<tr><td>Desconto</td><td style="text-align:right">-${fmt(order.discountAmount)}</td></tr>` : ''}
    <tr><td><b>TOTAL</b></td><td style="text-align:right"><b>${fmt(order.total)}</b></td></tr>
  </table>
  ${order.notes ? `<p><b>Obs.:</b> ${order.notes}</p>` : ''}
  <script>window.onload=()=>{window.print();window.close();}</script>
  </body></html>`;
}

function OrderCard({ order, highlight, dragging, onWorkflowChange, onPaymentStatus }: {
  order: Order; highlight: boolean; dragging?: boolean;
  onWorkflowChange: (id: number, workflow: WorkflowStage | 'cancelled') => void;
  onPaymentStatus: (id: number, status: PaymentStatus) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const workflow = getWorkflow(order);
  const colIndex = COLUMN_ORDER.indexOf(workflow as ColumnKey);
  const prevStatus = colIndex > 0 ? COLUMN_ORDER[colIndex - 1] : null;
  const nextStatus = colIndex >= 0 && colIndex < COLUMN_ORDER.length - 1 ? COLUMN_ORDER[colIndex + 1] : null;
  const lastChange = order.history?.length ? order.history[order.history.length - 1] : null;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `order-${order.id}`,
    data: { orderId: order.id, workflow },
  });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  const move = async (wf: WorkflowStage | 'cancelled') => {
    setUpdating(true);
    await onWorkflowChange(order.id, wf);
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
        highlight ? 'border-amber-500 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.25)]' : 'border-zinc-800 bg-zinc-900'
      } ${dragging ? 'shadow-2xl ring-2 ring-amber-500/60' : ''}`}
    >
      <div className="p-3 pb-2 flex items-start gap-2">
        <button {...attributes} {...listeners}
          className="mt-0.5 p-1.5 -ml-1 text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          title="Arrastar">
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
          {lastChange && (
            <p className="text-zinc-600 text-[10px] mt-0.5">
              {lastChange.label} às {formatTime(lastChange.at)}
            </p>
          )}
        </div>
      </div>

      <div className="px-3 flex items-center gap-1.5 flex-wrap text-[10px]">
        <span className="font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {ORDER_TYPE_LABELS[order.orderType]}
        </span>
        <span className="font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {PAYMENT_METHOD_LABELS[order.paymentMethod]}
          {order.cardType ? ` · ${CARD_TYPE_LABELS[order.cardType]}` : ''}
        </span>
        <button
          type="button"
          onClick={() => onPaymentStatus(order.id, order.paymentStatus === 'paid' ? 'pending' : 'paid')}
          className={`font-black uppercase px-1.5 py-0.5 rounded ${
            order.paymentStatus === 'paid' ? 'bg-green-500/15 text-green-400' :
            order.paymentStatus === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-zinc-700/40 text-zinc-400'
          }`}
          title="Alternar status do pagamento"
        >
          {PAYMENT_STATUS_LABELS[order.paymentStatus]}
        </button>
        {order.receiptDataUrl && (
          <button type="button" onClick={() => setShowReceipt(true)}
            className="font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 flex items-center gap-1">
            <ImageIcon size={10} /> Comprovante
          </button>
        )}
      </div>

      <div className="px-3 mt-2 space-y-1">
        {order.items.map(item => (
          <div key={item.id} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-zinc-300">{item.quantity}x {item.productName}</span>
              <span className="text-zinc-500 shrink-0">{fmt(item.subtotal)}</span>
            </div>
            {item.addons?.length > 0 && (
              <p className="text-zinc-500 text-[11px] pl-3">+ {item.addons.map(a => a.name).join(', ')}</p>
            )}
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="mx-3 mt-2 bg-zinc-950 rounded-lg p-2 text-[11px]">
          <span className="text-zinc-500">Obs.: </span><span className="text-zinc-300">{order.notes}</span>
        </div>
      )}

      {order.orderType === 'delivery' && order.address && (
        <div className="mx-3 mt-2 bg-zinc-950 rounded-lg p-2 text-[11px] space-y-0.5">
          <p className="text-zinc-300 flex items-start gap-1">
            <MapPin size={11} className="text-amber-500 mt-0.5 shrink-0" />
            {order.address}{order.addressNumber ? `, ${order.addressNumber}` : ''} — {order.neighborhood}
          </p>
          {order.distanceKm && (
            <p className="text-zinc-500 pl-4 flex items-center gap-1"><Route size={10} /> {parseFloat(order.distanceKm).toFixed(1)} km</p>
          )}
        </div>
      )}

      {order.changeFor && (
        <p className="px-3 mt-2 text-[11px] text-amber-400 font-bold">Troco para {fmt(order.changeFor)}</p>
      )}

      <div className="px-3 mt-2 flex items-center justify-between">
        <span className="text-zinc-500 text-xs">Total</span>
        <span className="text-amber-500 font-black text-base">{fmt(order.total)}</span>
      </div>

      {showHistory && (order.history?.length ?? 0) > 0 && (
        <div className="mx-3 mt-2 bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 space-y-1.5">
          <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Histórico</p>
          {order.history!.map((h, i) => (
            <div key={i} className="flex justify-between text-[11px]">
              <span className="text-zinc-300">{h.label}</span>
              <span className="text-zinc-600">{formatTime(h.at)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 pt-2 flex items-center gap-1.5 flex-wrap">
        <button onClick={() => {
          const number = normalizePhoneForWhatsapp(order.phone);
          if (number) window.open(`https://wa.me/${number}?text=${encodeURIComponent(`Olá ${order.customerName}! Pedido #${order.orderNumber} — The Burger GN.`)}`, '_blank');
        }} className="p-2 bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 rounded-lg" title="WhatsApp (manual)">
          <MessageCircle size={15} />
        </button>
        <button onClick={() => {
          const win = window.open('', '_blank', 'width=350,height=600');
          if (!win) return;
          win.document.write(buildReceiptHTML(order));
          win.document.close();
        }} className="p-2 text-zinc-500 hover:text-white bg-zinc-800 rounded-lg" title="Imprimir">
          <Printer size={15} />
        </button>
        <button onClick={() => setShowHistory(v => !v)}
          className={`p-2 rounded-lg transition-colors ${showHistory ? 'text-amber-500 bg-amber-500/10' : 'text-zinc-500 hover:text-white bg-zinc-800'}`}
          title="Histórico">
          <History size={15} />
        </button>
        {order.status !== 'cancelled' && (
          <button onClick={() => move('cancelled')} disabled={updating}
            className="p-2 text-red-500/70 hover:text-red-400 bg-red-950/30 rounded-lg" title="Cancelar">
            <Ban size={15} />
          </button>
        )}
        <div className="flex-1" />
        {prevStatus && (
          <button onClick={() => move(prevStatus)} disabled={updating}
            className="p-2 text-zinc-500 hover:text-white bg-zinc-800 rounded-lg" title={WORKFLOW_LABELS[prevStatus]}>
            <ChevronLeft size={15} />
          </button>
        )}
        {nextStatus && (
          <button onClick={() => move(nextStatus)} disabled={updating}
            className={`px-2.5 py-2 rounded-lg font-bold text-xs uppercase tracking-wide flex items-center gap-1 ${COLUMNS.find(c => c.key === nextStatus)?.btnClass ?? 'bg-amber-500 text-zinc-950'}`}
            title={WORKFLOW_LABELS[nextStatus]}>
            {WORKFLOW_LABELS[nextStatus].split(' ')[0]} <ChevronRight size={14} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showReceipt && order.receiptDataUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowReceipt(false)}>
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-white font-bold text-sm">Comprovante #{order.orderNumber}</p>
                <button onClick={() => setShowReceipt(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              <img src={order.receiptDataUrl} alt="Comprovante" className="w-full rounded-xl max-h-[70vh] object-contain bg-zinc-900" />
              {order.paymentStatus !== 'paid' && (
                <button type="button" onClick={() => { onPaymentStatus(order.id, 'paid'); setShowReceipt(false); }}
                  className="mt-3 w-full h-11 rounded-xl bg-green-500 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} /> Marcar como pago
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Column({ col, orders, newOrderIds, onWorkflowChange, onPaymentStatus }: {
  col: ColumnDef; orders: Order[]; newOrderIds: Set<number>;
  onWorkflowChange: (id: number, workflow: WorkflowStage | 'cancelled') => void;
  onPaymentStatus: (id: number, status: PaymentStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div className="flex flex-col shrink-0 w-[300px] sm:w-[320px] h-full">
      <div className={`rounded-t-2xl border border-b-0 px-4 py-3 flex items-center justify-between sticky top-0 z-10 ${col.headerClass}`}>
        <h2 className="text-white font-black uppercase text-xs tracking-wide">{col.label}</h2>
        <span className={`text-xs font-black w-6 h-6 rounded-full flex items-center justify-center ${col.badgeClass}`}>
          {orders.length}
        </span>
      </div>
      <div ref={setNodeRef}
        className={`flex-1 border border-t-0 rounded-b-2xl p-3 space-y-3 overflow-y-auto min-h-[200px] transition-colors ${
          isOver ? 'bg-amber-500/[0.08] border-amber-500/40' : 'border-zinc-800 bg-zinc-950/40'
        }`}>
        <AnimatePresence mode="popLayout">
          {orders.length === 0 ? (
            <div className="text-center py-10"><p className="text-zinc-700 text-xs font-medium">Nenhum pedido</p></div>
          ) : orders.map(order => (
            <OrderCard key={order.id} order={order} highlight={newOrderIds.has(order.id)}
              onWorkflowChange={onWorkflowChange} onPaymentStatus={onPaymentStatus} />
          ))}
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
  const [filter, setFilter] = useState<'all' | ColumnKey>('all');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(SOUND_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const fetchOrders = useCallback(async () => {
    try { setOrders(await getOrders()); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOrders();
    const es = new EventSource('/api/orders/stream', { withCredentials: true });

    es.addEventListener('new_order', (e) => {
      const order = JSON.parse(e.data) as Order;
      if (soundEnabledRef.current) playBeep();
      setOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
      setNewOrderIds(prev => new Set([...prev, order.id]));
      setNotification(`Novo pedido #${order.orderNumber} de ${order.customerName}!`);
      setTimeout(() => setNotification(null), 6000);
      setTimeout(() => setNewOrderIds(prev => { const s = new Set(prev); s.delete(order.id); return s; }), 30000);
    });

    es.addEventListener('order_status', (e) => {
      const data = JSON.parse(e.data) as { id: number; status: Order['status']; workflow?: WorkflowStage };
      setOrders(prev => prev.map(o => o.id === data.id
        ? { ...o, status: data.status, workflow: data.workflow ?? o.workflow }
        : o));
      fetchOrders();
    });

    es.addEventListener('order_receipt', () => { fetchOrders(); });
    es.addEventListener('order_payment', (e) => {
      const data = JSON.parse(e.data) as { id: number; paymentStatus: PaymentStatus };
      setOrders(prev => prev.map(o => o.id === data.id ? { ...o, paymentStatus: data.paymentStatus } : o));
    });

    return () => es.close();
  }, [fetchOrders]);

  const handleWorkflowChange = async (id: number, workflow: WorkflowStage | 'cancelled') => {
    setNewOrderIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    try {
      const updated = await updateOrderWorkflow(id, workflow);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updated, items: updated.items?.length ? updated.items : o.items } : o));
    } catch {
      fetchOrders();
    }
  };

  const handlePaymentStatus = async (id: number, paymentStatus: PaymentStatus) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, paymentStatus } : o));
    try { await updateOrderPaymentStatus(id, paymentStatus); }
    catch { fetchOrders(); }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragOrder(null);
    const { active, over } = event;
    if (!over) return;
    const orderId = active.data.current?.orderId as number | undefined;
    const from = active.data.current?.workflow as WorkflowStage | undefined;
    const to = over.id as ColumnKey;
    if (!orderId || !from || !COLUMN_ORDER.includes(to) || to === from) return;
    handleWorkflowChange(orderId, to);
  };

  const ordersByColumn = useMemo(() => {
    const map: Record<ColumnKey, Order[]> = { new: [], accepted: [], preparing: [], ready: [], out: [], done: [] };
    for (const o of orders) {
      const wf = getWorkflow(o);
      if (wf !== 'cancelled' && wf in map) map[wf].push(o);
    }
    return map;
  }, [orders]);

  const cancelledOrders = useMemo(() => orders.filter(o => o.status === 'cancelled'), [orders]);
  const activeCount = orders.filter(o => o.status !== 'cancelled' && o.status !== 'done').length;
  const newCount = ordersByColumn.new.length;
  const receiptPending = orders.filter(o => o.receiptDataUrl && o.paymentStatus !== 'paid').length;
  const visibleColumns = filter === 'all' ? COLUMNS : COLUMNS.filter(c => c.key === filter);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }}
            className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-zinc-950 text-center font-bold text-sm py-3 px-4 shadow-lg">
            🔔 {notification}
          </motion.div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 border-2 border-amber-500 rounded-full flex items-center justify-center shrink-0">
              <span className="text-amber-500 font-black text-xs">GN</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-white font-black uppercase text-base leading-none truncate">Painel da Atendente</h1>
              <p className="text-zinc-600 text-xs">The Burger GN</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs">
            <div className="text-center">
              <p className="text-lg font-black text-amber-500 leading-none">{newCount}</p>
              <p className="text-zinc-600 text-[9px] uppercase mt-0.5">Novos</p>
            </div>
            <div className="text-center border-l border-zinc-800 pl-4">
              <p className="text-lg font-black text-sky-400 leading-none">{activeCount}</p>
              <p className="text-zinc-600 text-[9px] uppercase mt-0.5">Em andamento</p>
            </div>
            <div className="text-center border-l border-zinc-800 pl-4">
              <p className="text-lg font-black text-white leading-none">{orders.length}</p>
              <p className="text-zinc-600 text-[9px] uppercase mt-0.5">Total</p>
            </div>
            {receiptPending > 0 && (
              <div className="text-center border-l border-zinc-800 pl-4">
                <p className="text-lg font-black text-amber-400 leading-none">{receiptPending}</p>
                <p className="text-zinc-600 text-[9px] uppercase mt-0.5">Comprovantes</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setShowCancelled(true)} className="p-2 text-zinc-400 hover:text-red-400 relative" title="Cancelados">
              <XCircle size={20} />
              {cancelledOrders.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {cancelledOrders.length}
                </span>
              )}
            </button>
            <button onClick={() => setSoundEnabled(prev => {
              const next = !prev; localStorage.setItem(SOUND_STORAGE_KEY, String(next)); return next;
            })} className={`p-2 ${soundEnabled ? 'text-amber-500' : 'text-zinc-600'}`} title="Alerta sonoro">
              {soundEnabled ? <Bell size={20} /> : <BellOff size={20} />}
            </button>
            <button onClick={async () => { await logout(); setLocation('/'); }} className="p-2 text-zinc-400 hover:text-red-400" title="Sair">
              <LogOut size={20} />
            </button>
          </div>
        </div>

        <div className="max-w-[1800px] mx-auto mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Filter size={14} className="text-zinc-600 shrink-0" />
          <button type="button" onClick={() => setFilter('all')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${filter === 'all' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'}`}>
            Todos ({orders.filter(o => o.status !== 'cancelled').length})
          </button>
          {COLUMNS.map(col => (
            <button key={col.key} type="button" onClick={() => setFilter(col.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                filter === col.key ? col.badgeClass : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
              }`}>
              {col.label} ({ordersByColumn[col.key].length})
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 px-4 py-5 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={(e: DragStartEvent) => {
              const orderId = e.active.data.current?.orderId as number | undefined;
              setActiveDragOrder(orders.find(o => o.id === orderId) ?? null);
            }}
            onDragEnd={handleDragEnd}>
            <div className="max-w-[1800px] mx-auto h-full flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 240px)' }}>
              {visibleColumns.map(col => (
                <Column key={col.key} col={col} orders={ordersByColumn[col.key]} newOrderIds={newOrderIds}
                  onWorkflowChange={handleWorkflowChange} onPaymentStatus={handlePaymentStatus} />
              ))}
            </div>
            <DragOverlay>
              {activeDragOrder && (
                <div className="w-[300px] rotate-2">
                  <OrderCard order={activeDragOrder} highlight={false} dragging
                    onWorkflowChange={handleWorkflowChange} onPaymentStatus={handlePaymentStatus} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      <AnimatePresence>
        {showCancelled && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowCancelled(false)}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[80vh] overflow-y-auto p-4"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-black uppercase flex items-center gap-2">
                  <XCircle size={18} className="text-red-500" /> Cancelados
                </h2>
                <button onClick={() => setShowCancelled(false)} className="p-2 text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              {cancelledOrders.length === 0 ? (
                <p className="text-zinc-600 text-sm text-center py-10">Nenhum pedido cancelado.</p>
              ) : cancelledOrders.map(order => (
                <div key={order.id} className="mb-3">
                  <OrderCard order={order} highlight={false} onWorkflowChange={handleWorkflowChange} onPaymentStatus={handlePaymentStatus} />
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="sticky bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
        <div className="max-w-[1800px] mx-auto flex overflow-x-auto no-scrollbar">
          {[
            { href: '/admin', icon: LayoutDashboard, label: 'Pedidos', active: true },
            { href: '/admin/cardapio', icon: UtensilsCrossed, label: 'Cardápio' },
            { href: '/admin/financeiro', icon: TrendingUp, label: 'Financeiro' },
            { href: '/admin/cupons', icon: Tag, label: 'Cupons' },
            { href: '/admin/clube', icon: Crown, label: 'Clube' },
            { href: '/admin/taxas', icon: MapPin, label: 'Bairros' },
            { href: '/admin/entrega-km', icon: Navigation, label: 'Por KM' },
            { href: '/admin/config', icon: Settings, label: 'Config' },
            { href: '/admin/importar', icon: Upload, label: 'Importar' },
          ].map(item => (
            <Link key={item.href} href={item.href} className="flex-1 min-w-[64px]">
              <div className={`flex flex-col items-center gap-0.5 py-2.5 ${item.active ? 'text-amber-500' : 'text-zinc-500 hover:text-white'}`}>
                <item.icon size={18} />
                <span className="text-[9px] font-bold uppercase">{item.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
