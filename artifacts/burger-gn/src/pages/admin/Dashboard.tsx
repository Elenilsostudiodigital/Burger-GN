import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useAdmin } from '../../context/AdminContext';
import {
  getOrders, updateOrderWorkflow, updateOrderPaymentStatus, getPrepStats,
  openCustomerWhatsapp, buildCustomerNotifyMessage, WHATSAPP_EXTERNAL_ENABLED,
  openWhatsappCompose, buildPreparingUpdateWhatsappMessage,
  getAdminMessageTemplate, buildOrderTemplateVars, interpolateMessageTemplate,
  getAdminPrinterSettings,
  REJECT_REASON_SUGGESTIONS, RECEIPT_REJECT_SUGGESTIONS,
  Order, WorkflowStage, PrepDayStats,
  ORDER_TYPE_LABELS, PAYMENT_STATUS_LABELS, WORKFLOW_LABELS,
  formatPaymentMethod, orderHasReceipt,
  getAdminStreetRequests, DeliveryStreetRequest,
} from '../../lib/api';
import {
  LayoutDashboard, UtensilsCrossed, LogOut, Bell, BellOff,
  Printer, Clock, MessageCircle, History,
  XCircle, Tag, MapPin, Navigation, Settings, Route, Upload, TrendingUp,
  ChevronLeft, ChevronRight, GripVertical, X, Crown, Filter, ImageIcon, CheckCircle2, Check, Ban, Star, Users, Plus, PackageCheck, Megaphone, Pencil,
} from 'lucide-react';
import { PrepCountdown, prepCardBorderClass } from '../../components/PrepCountdown';
import { AreaAnalysisRequestCard } from '../../components/AreaAnalysisRequestCard';
import { PedidosPresenceBar } from '../../components/PedidosPresenceBar';
import { EditOrderItemsModal } from '../../components/EditOrderItemsModal';
import { buildReceiptHTML, printOrderReceipt } from '../../lib/printReceipt';
import {
  computePrepRemainingSeconds,
  formatPrepDuration,
  getPrepVisualState,
} from '../../lib/prepTimer';

/** Board columns — pending orders never auto-advance. */
type ColumnKey = 'new' | 'preparing' | 'ready' | 'out' | 'done';

interface ColumnDef {
  key: ColumnKey;
  label: string;
  headerClass: string;
  badgeClass: string;
  btnClass: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'new', label: 'Novos Pedidos', headerClass: 'border-amber-500/40 bg-amber-500/[0.07]', badgeClass: 'bg-amber-500 text-zinc-950', btnClass: 'bg-amber-500 text-zinc-950' },
  { key: 'preparing', label: 'Em Preparo', headerClass: 'border-orange-500/40 bg-orange-500/[0.07]', badgeClass: 'bg-orange-500 text-zinc-950', btnClass: 'bg-orange-500 text-zinc-950' },
  { key: 'ready', label: 'Pronto', headerClass: 'border-emerald-500/40 bg-emerald-500/[0.07]', badgeClass: 'bg-emerald-500 text-zinc-950', btnClass: 'bg-emerald-500 text-zinc-950' },
  { key: 'out', label: 'Saiu para Entrega', headerClass: 'border-violet-500/40 bg-violet-500/[0.07]', badgeClass: 'bg-violet-500 text-zinc-950', btnClass: 'bg-violet-500 text-zinc-950' },
  { key: 'done', label: 'Entregue', headerClass: 'border-zinc-500/40 bg-zinc-600/[0.07]', badgeClass: 'bg-zinc-500 text-zinc-950', btnClass: 'bg-zinc-600 text-white' },
];

const COLUMN_ORDER: ColumnKey[] = COLUMNS.map(c => c.key);
const SOUND_STORAGE_KEY = 'admin_sound_enabled';

function fmt(val: string) { return `R$ ${parseFloat(val).toFixed(2).replace('.', ',')}` }
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR');
}
function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'agora';
  if (diff < 60) return `${diff}min`;
  return `${Math.floor(diff / 60)}h`;
}

function needsPaymentConference(order: Order): boolean {
  return order.paymentMethod === 'pix'
    && order.pixMode !== 'online'
    && !!orderHasReceipt(order)
    && order.paymentStatus !== 'paid'
    && order.status !== 'cancelled';
}

function canAcceptOrder(order: Order): boolean {
  if (order.status === 'cancelled') return false;
  if (order.workflow === 'awaiting_payment') return false;
  if (order.paymentMethod === 'pix' && order.paymentStatus !== 'paid') return false;
  return true;
}

/** Pix without receipt stays off the board until the customer sends proof.
 *  Attendant (Novo Pedido) orders appear immediately, including PIX awaiting payment.
 *  Finalized orders leave the operational board (Pedidos Finalizados). */
function isVisibleOnBoard(order: Order): boolean {
  if (order.workflow === 'finalized') return false;
  if (order.status === 'cancelled') return true;
  if (order.source === 'attendant') return true;
  if (order.paymentMethod === 'pix' && order.workflow === 'awaiting_payment' && !orderHasReceipt(order)) {
    return false;
  }
  return true;
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

function getBoardColumn(order: Order): ColumnKey | 'cancelled' {
  if (order.workflow === 'finalized') return 'cancelled'; // unused — hidden by isVisibleOnBoard
  if (order.status === 'cancelled') return 'cancelled';
  const wf = order.workflow === 'accepted' ? 'preparing' : order.workflow;
  if (wf === 'awaiting_payment') return 'new';
  if (wf === 'preparing' || wf === 'ready' || wf === 'out' || wf === 'done' || wf === 'new') return wf;
  if (order.status === 'preparing') return 'preparing';
  if (order.status === 'delivery') return 'out';
  if (order.status === 'done') return 'done';
  return 'new';
}

function notifyCustomer(
  order: Order,
  workflow: WorkflowStage | 'cancelled' | 'payment_confirmed' | 'receipt_refused',
  rejectReason?: string | null,
  apiMessage?: string | null,
) {
  // TEMP: external WhatsApp disabled — message stays in-app only (Meu Pedido).
  // Structure kept: when WHATSAPP_EXTERNAL_ENABLED is true, opens wa.me again.
  const message = apiMessage
    || buildCustomerNotifyMessage(order.orderNumber, order.customerName, workflow, rejectReason);
  if (WHATSAPP_EXTERNAL_ENABLED) {
    openCustomerWhatsapp(order.phone, message);
  }
}

function OrderCard({ order, highlight, dragging, onAccept, onRefuse, onAdvance, onBack, onConfirmPayment, onRefuseReceipt, onFinalize, onEdit }: {
  order: Order; highlight: boolean; dragging?: boolean;
  onAccept: (order: Order) => void;
  onRefuse: (order: Order) => void;
  onAdvance: (order: Order, workflow: ColumnKey) => void;
  onBack: (order: Order, workflow: ColumnKey) => void;
  onConfirmPayment: (order: Order) => void;
  onRefuseReceipt: (order: Order) => void;
  onFinalize: (order: Order) => void;
  onEdit: (order: Order) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const column = getBoardColumn(order);
  const colIndex = column === 'cancelled' ? -1 : COLUMN_ORDER.indexOf(column);
  const prevStatus = colIndex > 0 ? COLUMN_ORDER[colIndex - 1] : null;
  const nextStatus = colIndex >= 0 && colIndex < COLUMN_ORDER.length - 1 ? COLUMN_ORDER[colIndex + 1] : null;
  const lastChange = order.history?.length ? order.history[order.history.length - 1] : null;
  const awaitingPay = needsPaymentConference(order);
  const isPending = column === 'new' && !awaitingPay && canAcceptOrder(order);
  const isDelivered = column === 'done';
  const dragDisabled = column === 'cancelled' || isDelivered || awaitingPay || (column === 'new' && !canAcceptOrder(order));
  const showPrepTimer = !!order.prepStartedAt && (column === 'preparing' || column === 'ready' || !!order.prepFinishedAt);
  const canEditItems =
    !awaitingPay
    && !isPending
    && (column === 'preparing' || column === 'ready' || column === 'out');

  useEffect(() => {
    if (!order.prepStartedAt || order.prepFinishedAt || column !== 'preparing') return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [order.prepStartedAt, order.prepFinishedAt, column]);

  const remaining = computePrepRemainingSeconds({
    prepStartedAt: order.prepStartedAt,
    prepFinishedAt: order.prepFinishedAt,
    prepTimeMax: order.prepTimeMax,
    now: tick,
  });
  const prepVisual = column === 'preparing' ? getPrepVisualState(remaining) : 'idle';

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `order-${order.id}`,
    data: { orderId: order.id, workflow: column },
    disabled: dragDisabled,
  });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  const run = async (fn: () => Promise<void> | void) => {
    setUpdating(true);
    try { await fn(); } finally { setUpdating(false); }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border overflow-hidden transition-colors touch-none ${
        prepCardBorderClass(prepVisual, highlight)
      } ${dragging ? 'shadow-2xl ring-2 ring-amber-500/60' : ''} ${isDragging ? 'opacity-30' : ''}`}
    >
      <div className="p-3 pb-2 flex items-start gap-2">
        {!dragDisabled && (
          <button {...attributes} {...listeners}
            className="mt-0.5 p-1.5 -ml-1 text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing shrink-0 touch-none"
            title="Arrastar">
            <GripVertical size={16} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-amber-500 font-black text-lg">#{order.orderNumber}</span>
            <span className="text-zinc-500 text-xs flex items-center gap-1">
              <Clock size={11} /> {formatDate(order.createdAt)} · {formatTime(order.createdAt)} · {timeAgo(order.createdAt)}
            </span>
            {order.source === 'attendant' && (
              <span className="bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[9px] font-black uppercase px-1.5 py-0.5 rounded">
                Atendente
              </span>
            )}
            {awaitingPay && (
              <span className="bg-yellow-400 text-zinc-950 text-[9px] font-black uppercase px-1.5 py-0.5 rounded animate-pulse">
                🟡 Aguardando conferência
              </span>
            )}
            {isPending && (
              <span className="bg-amber-500 text-zinc-950 text-[9px] font-black uppercase px-1.5 py-0.5 rounded animate-pulse">
                🟡 Pendente
              </span>
            )}
          </div>
          <p className="text-white font-bold truncate">{order.customerName}</p>
          <p className="text-zinc-500 text-[11px] mt-0.5">WhatsApp: {order.phone}</p>
          {lastChange && (
            <p className="text-zinc-600 text-[10px] mt-0.5">
              {lastChange.label} às {formatTime(lastChange.at)}
            </p>
          )}
          {order.rejectReason && (
            <p className="text-red-400 text-[11px] mt-1">Motivo: {order.rejectReason}</p>
          )}
          {order.receiptRejectReason && order.paymentStatus === 'failed' && (
            <p className="text-red-400 text-[11px] mt-1">Comprovante: {order.receiptRejectReason}</p>
          )}
        </div>
      </div>

      <div className="px-3 flex items-center gap-1.5 flex-wrap text-[10px]">
        <span className="font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {ORDER_TYPE_LABELS[order.orderType]}
        </span>
        <span className="font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {formatPaymentMethod(order)}
        </span>
        <span
          className={`font-black uppercase px-1.5 py-0.5 rounded ${
            order.paymentStatus === 'paid' ? 'bg-green-500/15 text-green-400' :
            order.paymentStatus === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-zinc-700/40 text-zinc-400'
          }`}
        >
          {PAYMENT_STATUS_LABELS[order.paymentStatus]}
        </span>
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

      {showPrepTimer && (
        <div className="px-3 mt-2">
          <PrepCountdown
            prepStartedAt={order.prepStartedAt}
            prepFinishedAt={order.prepFinishedAt}
            prepTimeMax={order.prepTimeMax}
            prepDurationSeconds={order.prepDurationSeconds}
            showKitchenAlerts={column === 'preparing'}
            compact
          />
        </div>
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

      {/* Pix: Confirm / Refuse receipt */}
      {awaitingPay && (
        <div className="p-3 pt-2 space-y-2">
          {order.receiptDataUrl && (
            <button type="button" onClick={() => setShowReceipt(true)}
              className="w-full rounded-xl overflow-hidden border border-amber-500/30 bg-zinc-950">
              <img src={order.receiptDataUrl} alt="Comprovante" className="w-full max-h-36 object-contain" />
              <p className="text-[10px] text-amber-400 font-bold uppercase py-1.5">Ver comprovante</p>
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={updating} onClick={() => run(() => onRefuseReceipt(order))}
              className="h-11 rounded-xl bg-red-950/50 border border-red-800/50 text-red-400 font-black text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 hover:bg-red-900/40">
              <Ban size={14} /> Recusar comprovante
            </button>
            <button type="button" disabled={updating} onClick={() => run(() => onConfirmPayment(order))}
              className="h-11 rounded-xl bg-green-500 text-zinc-950 font-black text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 hover:bg-green-400">
              <CheckCircle2 size={14} /> Confirmar pagamento
            </button>
          </div>
          <p className="text-zinc-600 text-[10px] text-center">
            O pedido só entra como Pendente após confirmar o pagamento.
          </p>
        </div>
      )}

      {/* Pending: Accept / Refuse (kitchen) */}
      {isPending && (
        <div className="p-3 pt-2 grid grid-cols-2 gap-2">
          <button type="button" disabled={updating} onClick={() => run(() => onRefuse(order))}
            className="h-11 rounded-xl bg-red-950/50 border border-red-800/50 text-red-400 font-black text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 hover:bg-red-900/40">
            <Ban size={15} /> Recusar
          </button>
          <button type="button" disabled={updating} onClick={() => run(() => onAccept(order))}
            className="h-11 rounded-xl bg-green-500 text-zinc-950 font-black text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 hover:bg-green-400">
            <Check size={15} /> Aceitar
          </button>
        </div>
      )}

      {!isPending && column !== 'cancelled' && isDelivered && (
        <div className="p-3 pt-2">
          <button
            type="button"
            onClick={() => run(() => onFinalize(order))}
            disabled={updating}
            className="w-full h-11 rounded-xl font-black text-sm uppercase tracking-wide bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Finalizar Pedido
          </button>
        </div>
      )}

      {!isPending && column !== 'cancelled' && !isDelivered && column === 'preparing' && (
        <div className="px-3 pt-2">
          <button
            type="button"
            disabled={updating || !order.trackingId || !order.phone}
            onClick={async () => {
              try {
                const tpl = await getAdminMessageTemplate('em_preparo');
                const vars = buildOrderTemplateVars(order, { statusLabel: 'Em Preparo' });
                const message = interpolateMessageTemplate(tpl.body, vars);
                const opened = openWhatsappCompose(order.phone, message);
                if (!opened) {
                  window.alert('Número de WhatsApp do pedido inválido.');
                }
              } catch {
                const fallback = buildPreparingUpdateWhatsappMessage(
                  order.customerName,
                  order.trackingId,
                );
                const opened = openWhatsappCompose(order.phone, fallback);
                if (!opened) {
                  window.alert('Número de WhatsApp do pedido inválido.');
                }
              }
            }}
            className="w-full h-11 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50"
          >
            📲 Enviar atualização ao cliente
          </button>
        </div>
      )}

      {!isPending && column !== 'cancelled' && !isDelivered && (
        <div className="p-3 pt-2 flex items-center gap-1.5 flex-wrap">
          {WHATSAPP_EXTERNAL_ENABLED && (
            <button onClick={() => {
              openCustomerWhatsapp(order.phone, `Olá ${order.customerName.split(' ')[0] || ''}! Pedido #${order.orderNumber} — The Burger GN.`);
            }} className="p-2 bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 rounded-lg" title="WhatsApp">
              <MessageCircle size={15} />
            </button>
          )}
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
          {canEditItems && (
            <button
              type="button"
              onClick={() => onEdit(order)}
              disabled={updating}
              className="px-2.5 py-2 rounded-lg text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 font-bold text-[10px] uppercase tracking-wide flex items-center gap-1"
              title="Editar itens"
            >
              <Pencil size={14} /> Editar
            </button>
          )}
          <button onClick={() => onRefuse(order)} disabled={updating}
            className="p-2 text-red-500/70 hover:text-red-400 bg-red-950/30 rounded-lg" title="Recusar">
            <Ban size={15} />
          </button>
          <div className="flex-1" />
          {prevStatus && prevStatus !== 'new' && (
            <button onClick={() => run(() => onBack(order, prevStatus))} disabled={updating}
              className="p-2 text-zinc-500 hover:text-white bg-zinc-800 rounded-lg" title={WORKFLOW_LABELS[prevStatus]}>
              <ChevronLeft size={15} />
            </button>
          )}
          {nextStatus && (
            <button onClick={() => run(() => onAdvance(order, nextStatus))} disabled={updating}
              className={`px-2.5 py-2 rounded-lg font-bold text-xs uppercase tracking-wide flex items-center gap-1 ${COLUMNS.find(c => c.key === nextStatus)?.btnClass ?? 'bg-amber-500 text-zinc-950'}`}
              title={WORKFLOW_LABELS[nextStatus]}>
              {WORKFLOW_LABELS[nextStatus].split(' ')[0]} <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}

      {isPending && (
        <div className="px-3 pb-3 flex items-center gap-1.5">
          {WHATSAPP_EXTERNAL_ENABLED && (
            <button onClick={() => {
              openCustomerWhatsapp(order.phone, `Olá ${order.customerName.split(' ')[0]}! Pedido #${order.orderNumber} — The Burger GN.`);
            }} className="p-2 bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 rounded-lg" title="WhatsApp">
              <MessageCircle size={15} />
            </button>
          )}
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
        </div>
      )}

      <div
        className={`fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4 ${showReceipt && order.receiptDataUrl ? '' : 'hidden'}`}
        onClick={() => setShowReceipt(false)}
        aria-hidden={!(showReceipt && order.receiptDataUrl)}
      >
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 max-w-md w-full" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-white font-bold text-sm">Comprovante #{order.orderNumber}</p>
            <button type="button" onClick={() => setShowReceipt(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
          </div>
          {order.receiptDataUrl ? (
            <img src={order.receiptDataUrl} alt="Comprovante" className="w-full rounded-xl max-h-[70vh] object-contain bg-zinc-900" />
          ) : null}
          <p className="text-zinc-500 text-[11px] mt-2 text-center">
            Confirme o pagamento para enviar o pedido à fila Pendente. Depois a loja poderá aceitar.
          </p>
          {order.paymentStatus !== 'paid' && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { onRefuseReceipt(order); setShowReceipt(false); }}
                className="h-11 rounded-xl bg-red-950/50 border border-red-800/50 text-red-400 font-bold text-xs flex items-center justify-center gap-1">
                <Ban size={14} /> Recusar
              </button>
              <button type="button" onClick={() => { onConfirmPayment(order); setShowReceipt(false); }}
                className="h-11 rounded-xl bg-green-500 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1">
                <CheckCircle2 size={14} /> Confirmar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Column({ col, orders, newOrderIds, onAccept, onRefuse, onAdvance, onBack, onConfirmPayment, onRefuseReceipt, onFinalize, onEdit }: {
  col: ColumnDef; orders: Order[]; newOrderIds: Set<number>;
  onAccept: (order: Order) => void;
  onRefuse: (order: Order) => void;
  onAdvance: (order: Order, workflow: ColumnKey) => void;
  onBack: (order: Order, workflow: ColumnKey) => void;
  onConfirmPayment: (order: Order) => void;
  onRefuseReceipt: (order: Order) => void;
  onFinalize: (order: Order) => void;
  onEdit: (order: Order) => void;
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
        {/*
          Stable list (no AnimatePresence/popLayout).
          Exit/layout animations raced React + dnd-kit → insertBefore/removeChild
          when confirming/refusing PIX receipts moved cards between columns.
        */}
        {orders.length === 0 ? (
          <div className="text-center py-10"><p className="text-zinc-700 text-xs font-medium">Nenhum pedido</p></div>
        ) : orders.map(order => (
          <OrderCard key={order.id} order={order} highlight={newOrderIds.has(order.id)}
            onAccept={onAccept} onRefuse={onRefuse} onAdvance={onAdvance} onBack={onBack}
            onConfirmPayment={onConfirmPayment} onRefuseReceipt={onRefuseReceipt} onFinalize={onFinalize}
            onEdit={onEdit} />
        ))}
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
  const [refuseOrder, setRefuseOrder] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectCustom, setRejectCustom] = useState('');
  const [refuseError, setRefuseError] = useState('');
  const [refuseSaving, setRefuseSaving] = useState(false);
  const [receiptRefuseOrder, setReceiptRefuseOrder] = useState<Order | null>(null);
  const [receiptRejectReason, setReceiptRejectReason] = useState('');
  const [receiptRejectCustom, setReceiptRejectCustom] = useState('');
  const [receiptRefuseError, setReceiptRefuseError] = useState('');
  const [receiptRefuseSaving, setReceiptRefuseSaving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(SOUND_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });
  const [prepStats, setPrepStats] = useState<PrepDayStats | null>(null);
  const [prepCelebration, setPrepCelebration] = useState<{
    orderNumber: number;
    durationSeconds: number;
  } | null>(null);
  const [streetRequests, setStreetRequests] = useState<DeliveryStreetRequest[]>([]);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const fetchOrders = useCallback(async () => {
    try { setOrders(await getOrders()); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const fetchPrepStats = useCallback(async () => {
    try { setPrepStats(await getPrepStats()); } catch { /* ignore */ }
  }, []);

  const fetchStreetRequests = useCallback(async () => {
    try {
      const list = await getAdminStreetRequests('pending');
      setStreetRequests(Array.isArray(list) ? list : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchPrepStats();
    fetchStreetRequests();
    const interval = setInterval(() => {
      fetchOrders();
      fetchPrepStats();
      fetchStreetRequests();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders, fetchPrepStats, fetchStreetRequests]);

  useEffect(() => {
    fetchOrders();
    const es = new EventSource('/api/orders/stream', { withCredentials: true });

    es.addEventListener('new_order', (e) => {
      const order = JSON.parse(e.data) as Order;
      if (soundEnabledRef.current) playBeep();
      setOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
      setNewOrderIds(prev => new Set([...prev, order.id]));
      const label = needsPaymentConference(order)
        ? `🔔 Novo comprovante enviado — #${order.orderNumber} aguardando conferência`
        : order.workflow === 'new' && order.paymentStatus === 'paid'
          ? `🔔 Pedido aguardando confirmação #${order.orderNumber} de ${order.customerName}`
          : `🔔 Novo pedido #${order.orderNumber} de ${order.customerName}`;
      setNotification(label);
      setTimeout(() => setNotification(null), 6000);
      setTimeout(() => setNewOrderIds(prev => { const s = new Set(prev); s.delete(order.id); return s; }), 30000);
    });

    es.addEventListener('order_status', (e) => {
      fetchOrders();
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          workflow?: string; id?: number; orderNumber?: number;
        };
        const wf = data.workflow;
        if (wf === 'ready') setNotification('🔔 Pedido pronto para entrega');
        else if (wf === 'out') setNotification('🔔 Pedido saiu para entrega');
        else if (wf === 'preparing') setNotification('🔔 Pedido em preparo');
        else if (wf === 'new') setNotification('🔔 Pedido aguardando confirmação');
        else if (wf === 'cancelled') setNotification('🔔 Pedido recusado');
        else if (wf === 'done') setNotification('🔔 Pedido entregue');
        if (wf) setTimeout(() => setNotification(null), 5000);
      } catch { /* ignore */ }
    });
    es.addEventListener('order_receipt', () => {
      fetchOrders();
      setNotification('🔔 Novo comprovante enviado');
      setTimeout(() => setNotification(null), 5000);
    });
    es.addEventListener('order_payment', () => {
      fetchOrders();
      setNotification('🔔 Status de pagamento atualizado');
      setTimeout(() => setNotification(null), 4000);
    });
    es.addEventListener('street_request', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as DeliveryStreetRequest;
        if (soundEnabledRef.current) playBeep();
        setStreetRequests((prev) => [data, ...prev.filter((r) => r.id !== data.id)]);
        setNotification('🔔 Nova solicitação de área de entrega.');
        setTimeout(() => setNotification(null), 6000);
      } catch {
        void fetchStreetRequests();
      }
    });
    es.addEventListener('street_request_resolved', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { id?: number };
        if (typeof data.id === 'number') {
          setStreetRequests((prev) => prev.filter((r) => r.id !== data.id));
        } else {
          void fetchStreetRequests();
        }
      } catch {
        void fetchStreetRequests();
      }
    });

    return () => es.close();
  }, [fetchOrders, fetchStreetRequests]);

  const applyUpdated = (id: number, updated: Order) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updated, items: updated.items?.length ? updated.items : o.items } : o));
  };

  const handleAccept = async (order: Order) => {
    if (!canAcceptOrder(order)) {
      setNotification('Confirme o pagamento Pix antes de aceitar este pedido.');
      setTimeout(() => setNotification(null), 4000);
      return;
    }
    setNewOrderIds(prev => { const s = new Set(prev); s.delete(order.id); return s; });
    try {
      const updated = await updateOrderWorkflow(order.id, 'preparing');
      applyUpdated(order.id, updated);
      notifyCustomer(order, 'preparing', null, updated.customerNotifyMessage);
      void fetchPrepStats();
      // Auto-print only when enabled in Configurações → Impressoras (default off).
      try {
        const { config } = await getAdminPrinterSettings();
        if (config.autoPrintOnAccept && config.defaultPrinterId) {
          const printed = printOrderReceipt(updated.items?.length ? updated : order, config);
          if (!printed) {
            setNotification('Pedido aceito — permita pop-ups para impressão automática.');
            setTimeout(() => setNotification(null), 4000);
          }
        }
      } catch {
        /* printer settings optional — never block accept */
      }
    } catch (err) {
      setNotification(err instanceof Error ? err.message : 'Não foi possível aceitar o pedido.');
      setTimeout(() => setNotification(null), 4000);
      fetchOrders();
    }
  };

  const handleConfirmPayment = async (order: Order) => {
    try {
      const updated = await updateOrderPaymentStatus(order.id, 'paid');
      applyUpdated(order.id, updated);
      notifyCustomer(order, 'payment_confirmed', null, updated.customerNotifyMessage);
      setNotification(`Pagamento confirmado — pedido #${order.orderNumber} na fila Pendente`);
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      setNotification(err instanceof Error ? err.message : 'Erro ao confirmar pagamento');
      setTimeout(() => setNotification(null), 4000);
      fetchOrders();
    }
  };

  const openRefuseReceipt = (order: Order) => {
    setReceiptRefuseOrder(order);
    setReceiptRejectReason('');
    setReceiptRejectCustom('');
    setReceiptRefuseError('');
  };

  const confirmRefuseReceipt = async () => {
    if (!receiptRefuseOrder) return;
    const reason = receiptRejectReason === '__other__'
      ? receiptRejectCustom.trim()
      : receiptRejectReason.trim();
    if (!reason) {
      setReceiptRefuseError('Selecione ou informe o motivo da recusa do comprovante.');
      return;
    }
    setReceiptRefuseSaving(true);
    setReceiptRefuseError('');
    try {
      const updated = await updateOrderPaymentStatus(receiptRefuseOrder.id, 'failed', { refuseReason: reason });
      applyUpdated(receiptRefuseOrder.id, updated);
      notifyCustomer(receiptRefuseOrder, 'receipt_refused', reason, updated.customerNotifyMessage);
      setReceiptRefuseOrder(null);
    } catch (err) {
      setReceiptRefuseError(err instanceof Error ? err.message : 'Não foi possível recusar o comprovante.');
      fetchOrders();
    } finally {
      setReceiptRefuseSaving(false);
    }
  };

  const handleAdvance = async (order: Order, workflow: ColumnKey) => {
    try {
      const updated = await updateOrderWorkflow(order.id, workflow);
      applyUpdated(order.id, updated);
      notifyCustomer(order, workflow, null, updated.customerNotifyMessage);
      if (workflow === 'ready') {
        void fetchPrepStats();
        if (updated.prepEarlyFinish && typeof updated.prepDurationSeconds === 'number') {
          setPrepCelebration({
            orderNumber: updated.orderNumber,
            durationSeconds: updated.prepDurationSeconds,
          });
          setTimeout(() => setPrepCelebration(null), 6500);
        }
      }
    } catch {
      fetchOrders();
    }
  };

  const handleBack = async (order: Order, workflow: ColumnKey) => {
    try {
      const updated = await updateOrderWorkflow(order.id, workflow);
      applyUpdated(order.id, updated);
    } catch {
      fetchOrders();
    }
  };

  const handleFinalize = async (order: Order) => {
    try {
      const updated = await updateOrderWorkflow(order.id, 'finalized');
      // Remove immediately from operational board (finalized is filtered out).
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...updated } : o)));
      setNotification(`Pedido #${order.orderNumber} finalizado`);
      setTimeout(() => setNotification(null), 3500);
    } catch {
      fetchOrders();
    }
  };

  const openRefuse = (order: Order) => {
    setRefuseOrder(order);
    setRejectReason('');
    setRejectCustom('');
    setRefuseError('');
  };

  const confirmRefuse = async () => {
    if (!refuseOrder) return;
    const reason = rejectReason === '__other__' ? rejectCustom.trim() : rejectReason.trim();
    if (!reason) {
      setRefuseError('Selecione ou informe o motivo da recusa.');
      return;
    }
    setRefuseSaving(true);
    setRefuseError('');
    try {
      const updated = await updateOrderWorkflow(refuseOrder.id, 'cancelled', { rejectReason: reason });
      applyUpdated(refuseOrder.id, updated);
      notifyCustomer(refuseOrder, 'cancelled', reason, updated.customerNotifyMessage);
      setRefuseOrder(null);
    } catch (err) {
      setRefuseError(err instanceof Error ? err.message : 'Não foi possível recusar o pedido.');
      fetchOrders();
    } finally {
      setRefuseSaving(false);
    }
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
    const from = active.data.current?.workflow as ColumnKey | undefined;
    const to = over.id as ColumnKey;
    if (!orderId || !from || !COLUMN_ORDER.includes(to) || to === from) return;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    if (needsPaymentConference(order) || (from === 'new' && !canAcceptOrder(order))) return;

    // From pending: only allow drop onto Em Preparo (= accept)
    if (from === 'new') {
      if (to === 'preparing') handleAccept(order);
      return;
    }
    // Cannot drag back into Novos Pedidos
    if (to === 'new') return;
    handleAdvance(order, to);
  };

  const ordersByColumn = useMemo(() => {
    const map: Record<ColumnKey, Order[]> = { new: [], preparing: [], ready: [], out: [], done: [] };
    for (const o of orders) {
      if (!isVisibleOnBoard(o)) continue;
      const col = getBoardColumn(o);
      if (col !== 'cancelled' && col in map) map[col].push(o);
    }
    return map;
  }, [orders]);

  const cancelledOrders = useMemo(() => orders.filter(o => o.status === 'cancelled'), [orders]);
  const activeCount = orders.filter(o =>
    o.status !== 'cancelled' && o.workflow !== 'finalized' && o.status !== 'done' && o.workflow !== 'done',
  ).length;
  // Board "total" should reflect operational orders only (not finalized archive).
  const boardOrders = useMemo(() => orders.filter(isVisibleOnBoard), [orders]);
  const operationalTotal = boardOrders.filter(o => o.status !== 'cancelled').length;
  const newCount = ordersByColumn.new.length;
  const receiptPending = orders.filter(o => orderHasReceipt(o) && o.paymentStatus !== 'paid').length;
  const visibleColumns = filter === 'all' ? COLUMNS : COLUMNS.filter(c => c.key === filter);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      
        {notification && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-zinc-950 text-center font-bold text-sm py-3 px-4 shadow-lg">
            {notification}
          </div>
        )}
      

      
        {prepCelebration && (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,380px)] rounded-2xl border border-emerald-500/40 bg-zinc-950/95 px-4 py-3 shadow-xl shadow-emerald-500/10 backdrop-blur">
            <p className="text-emerald-300 font-black text-sm">🎉 Excelente!</p>
            <p className="text-zinc-300 text-xs mt-1 leading-relaxed">
              Pedido #{prepCelebration.orderNumber} finalizado antes do prazo estimado.
            </p>
            <p className="text-white text-xs font-bold mt-1.5">
              Tempo total de preparo: {formatPrepDuration(prepCelebration.durationSeconds)}
            </p>
          </div>
        )}
      

      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="admin-shell-wide flex items-center justify-between gap-3">
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
              <p className="text-zinc-600 text-[9px] uppercase mt-0.5">Pendentes</p>
            </div>
            <div className="text-center border-l border-zinc-800 pl-4">
              <p className="text-lg font-black text-sky-400 leading-none">{activeCount}</p>
              <p className="text-zinc-600 text-[9px] uppercase mt-0.5">Em andamento</p>
            </div>
            <div className="text-center border-l border-zinc-800 pl-4">
              <p className="text-lg font-black text-white leading-none">{operationalTotal}</p>
              <p className="text-zinc-600 text-[9px] uppercase mt-0.5">Ativos</p>
            </div>
            {receiptPending > 0 && (
              <div className="text-center border-l border-zinc-800 pl-4">
                <p className="text-lg font-black text-amber-400 leading-none">{receiptPending}</p>
                <p className="text-zinc-600 text-[9px] uppercase mt-0.5">Comprovantes</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Link
              href="/admin/pedidos-finalizados"
              className="hidden sm:inline-flex items-center gap-1.5 mr-1 px-3 py-1.5 rounded-full bg-violet-600/20 border border-violet-700/40 text-violet-300 text-[10px] font-black uppercase tracking-wider hover:bg-violet-600/30"
              title="Pedidos finalizados"
            >
              <PackageCheck size={14} />
              Finalizados
            </Link>
            <Link
              href="/admin/novo-pedido"
              className="hidden sm:inline-flex items-center gap-1.5 mr-1 px-3 py-1.5 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-black uppercase tracking-wider hover:bg-amber-400"
              title="Lançar pedido de balcão, telefone ou WhatsApp"
            >
              <Plus size={14} strokeWidth={3} />
              Novo pedido
            </Link>
            <Link
              href="/admin/novo-pedido"
              className="sm:hidden p-2 text-amber-500"
              title="Novo pedido"
            >
              <Plus size={22} strokeWidth={2.5} />
            </Link>
            <button onClick={() => setShowCancelled(true)} className="p-2 text-zinc-400 hover:text-red-400 relative" title="Recusados">
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

        <div className="admin-shell-wide mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Filter size={14} className="text-zinc-600 shrink-0" />
          <button type="button" onClick={() => setFilter('all')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${filter === 'all' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'}`}>
            Todos ({operationalTotal})
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

        {prepStats && (
          <div className="admin-shell-wide mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2">
              <p className="text-zinc-500 text-[9px] font-bold uppercase tracking-wider">Tempo médio (hoje)</p>
              <p className="text-white font-black text-sm mt-0.5">
                {prepStats.averagePrepMinutes != null
                  ? `${String(prepStats.averagePrepMinutes).replace('.', ',')} min`
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
              <p className="text-emerald-500/80 text-[9px] font-bold uppercase tracking-wider">Dentro do prazo</p>
              <p className="text-emerald-400 font-black text-sm mt-0.5">{prepStats.onTimeCount}</p>
            </div>
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2">
              <p className="text-red-400/80 text-[9px] font-bold uppercase tracking-wider">Atrasados</p>
              <p className="text-red-400 font-black text-sm mt-0.5">{prepStats.lateCount}</p>
            </div>
          </div>
        )}

        <PedidosPresenceBar
          onAlert={(message) => {
            setNotification(message);
            setTimeout(() => setNotification(null), 5000);
          }}
        />
      </header>
      <div className={`px-4 pt-4 ${streetRequests.length ? '' : 'hidden'}`}>
        <div className="admin-shell-wide space-y-3">
          {streetRequests.map((req) => (
            <AreaAnalysisRequestCard
              key={req.id}
              request={req}
              onResolved={(id) => setStreetRequests((prev) => prev.filter((r) => r.id !== id))}
              onError={(message) => {
                setNotification(message);
                setTimeout(() => setNotification(null), 4000);
              }}
            />
          ))}
        </div>
      </div>

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
            <div className="admin-shell-wide h-full flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 240px)' }}>
              {visibleColumns.map(col => (
                <Column key={col.key} col={col} orders={ordersByColumn[col.key]} newOrderIds={newOrderIds}
                  onAccept={handleAccept} onRefuse={openRefuse} onAdvance={handleAdvance} onBack={handleBack}
                  onConfirmPayment={handleConfirmPayment} onRefuseReceipt={openRefuseReceipt} onFinalize={handleFinalize}
                  onEdit={setEditingOrder} />
              ))}
            </div>
            <DragOverlay>
              {activeDragOrder && (
                <div className="w-[300px] rotate-2">
                  <OrderCard order={activeDragOrder} highlight={false} dragging
                    onAccept={handleAccept} onRefuse={openRefuse} onAdvance={handleAdvance} onBack={handleBack}
                    onConfirmPayment={handleConfirmPayment} onRefuseReceipt={openRefuseReceipt} onFinalize={handleFinalize}
                    onEdit={setEditingOrder} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {/* Refuse modal */}
      {refuseOrder && (
          <div className="fixed inset-0 z-[90] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => !refuseSaving && setRefuseOrder(null)}>
            <div className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 space-y-4"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="text-white font-black uppercase text-sm">Recusar pedido #{refuseOrder.orderNumber}</h2>
                <button type="button" disabled={refuseSaving} onClick={() => setRefuseOrder(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              <p className="text-zinc-500 text-sm">Informe o motivo. O cliente verá a justificativa em Meu Pedido.</p>
              <div className="space-y-2">
                {REJECT_REASON_SUGGESTIONS.map(reason => (
                  <button key={reason} type="button" onClick={() => { setRejectReason(reason); setRefuseError(''); }}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-bold transition-all ${
                      rejectReason === reason ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                    }`}>
                    {reason}
                  </button>
                ))}
                <button type="button" onClick={() => { setRejectReason('__other__'); setRefuseError(''); }}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-bold transition-all ${
                    rejectReason === '__other__' ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                  }`}>
                  Outro motivo
                </button>
                {rejectReason === '__other__' && (
                  <textarea
                    value={rejectCustom}
                    onChange={e => setRejectCustom(e.target.value)}
                    placeholder="Descreva o motivo..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm resize-none h-24 focus:border-amber-500 focus:outline-none"
                  />
                )}
              </div>
              {refuseError && <p className="text-red-400 text-sm">{refuseError}</p>}
              <button type="button" disabled={refuseSaving} onClick={confirmRefuse}
                className="w-full h-12 rounded-xl bg-red-500 hover:bg-red-400 text-white font-black uppercase text-sm tracking-wide disabled:opacity-50">
                {refuseSaving ? 'Recusando...' : 'Confirmar recusa'}
              </button>
            </div>
          </div>
        )}

      {/* Refuse receipt modal */}
      {receiptRefuseOrder && (
          <div className="fixed inset-0 z-[90] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => !receiptRefuseSaving && setReceiptRefuseOrder(null)}>
            <div className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 space-y-4"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="text-white font-black uppercase text-sm">
                  Recusar comprovante #{receiptRefuseOrder.orderNumber}
                </h2>
                <button type="button" disabled={receiptRefuseSaving} onClick={() => setReceiptRefuseOrder(null)}
                  className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              <p className="text-zinc-500 text-sm">
                Informe o motivo. O cliente verá o aviso em Meu Pedido e poderá reenviar o comprovante.
              </p>
              <div className="space-y-2">
                {RECEIPT_REJECT_SUGGESTIONS.map(reason => (
                  <button key={reason} type="button"
                    onClick={() => { setReceiptRejectReason(reason); setReceiptRefuseError(''); }}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-bold transition-all ${
                      receiptRejectReason === reason
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                    }`}>
                    {reason}
                  </button>
                ))}
                <button type="button"
                  onClick={() => { setReceiptRejectReason('__other__'); setReceiptRefuseError(''); }}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-bold transition-all ${
                    receiptRejectReason === '__other__'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                  }`}>
                  Outro motivo
                </button>
                {receiptRejectReason === '__other__' && (
                  <textarea
                    value={receiptRejectCustom}
                    onChange={e => setReceiptRejectCustom(e.target.value)}
                    placeholder="Descreva o motivo..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm resize-none h-24 focus:border-amber-500 focus:outline-none"
                  />
                )}
              </div>
              {receiptRefuseError && <p className="text-red-400 text-sm">{receiptRefuseError}</p>}
              <button type="button" disabled={receiptRefuseSaving} onClick={confirmRefuseReceipt}
                className="w-full h-12 rounded-xl bg-red-500 hover:bg-red-400 text-white font-black uppercase text-sm tracking-wide disabled:opacity-50">
                {receiptRefuseSaving ? 'Enviando...' : 'Recusar comprovante'}
              </button>
            </div>
          </div>
        )}

      {showCancelled && (
          <div
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowCancelled(false)}>
            <div
              className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[80vh] overflow-y-auto p-4"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-black uppercase flex items-center gap-2">
                  <XCircle size={18} className="text-red-500" /> Recusados
                </h2>
                <button type="button" onClick={() => setShowCancelled(false)} className="p-2 text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              {cancelledOrders.length === 0 ? (
                <p className="text-zinc-600 text-sm text-center py-10">Nenhum pedido recusado.</p>
              ) : cancelledOrders.map(order => (
                <div key={order.id} className="mb-3">
                  <OrderCard order={order} highlight={false}
                    onAccept={handleAccept} onRefuse={openRefuse} onAdvance={handleAdvance} onBack={handleBack}
                    onConfirmPayment={handleConfirmPayment} onRefuseReceipt={openRefuseReceipt} onFinalize={handleFinalize}
                    onEdit={setEditingOrder} />
                </div>
              ))}
            </div>
          </div>
        )}

      {editingOrder && (
        <EditOrderItemsModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSaved={(updated) => {
            applyUpdated(updated.id, updated);
            setEditingOrder(null);
            setNotification(`Pedido #${updated.orderNumber} atualizado`);
            setTimeout(() => setNotification(null), 3000);
          }}
        />
      )}

      <nav className="sticky bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
        <div className="admin-shell-wide flex overflow-x-auto no-scrollbar">
          {[
            { href: '/admin', icon: TrendingUp, label: 'Início', active: false },
            { href: '/admin/pedidos', icon: LayoutDashboard, label: 'Pedidos', active: true },
            { href: '/admin/pedidos-finalizados', icon: PackageCheck, label: 'Finalizados', active: false },
            { href: '/admin/clientes', icon: Users, label: 'Clientes', active: false },
            { href: '/admin/avaliacoes', icon: Star, label: 'Avaliações', active: false },
            { href: '/admin/cardapio', icon: UtensilsCrossed, label: 'Cardápio' },
            { href: '/admin/divulgacao', icon: Megaphone, label: 'Divulgação' },
            { href: '/admin/financeiro', icon: TrendingUp, label: 'Financeiro' },
            { href: '/admin/cupons', icon: Tag, label: 'Cupons' },
            { href: '/admin/clube', icon: Crown, label: 'Clube' },
            { href: '/admin/taxas', icon: MapPin, label: 'Bairros' },
            { href: '/admin/entrega-km', icon: Navigation, label: 'Por KM' },
            { href: '/admin/config', icon: Settings, label: 'Config' },
            { href: '/admin/importar', icon: Upload, label: 'Importar' },
          ].map(item => (
            <Link key={item.href} href={item.href} className="flex-1 min-w-[64px]">
              <div className={`relative flex flex-col items-center gap-0.5 py-2.5 ${item.active ? 'text-amber-500' : 'text-zinc-500 hover:text-white'}`}>
                <item.icon size={18} />
                <span className="text-[9px] font-bold uppercase">{item.label}</span>
                <span
                  className={`absolute top-1 right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center ${
                    item.href === '/admin/pedidos' && streetRequests.length > 0 ? '' : 'invisible'
                  }`}
                >
                  {streetRequests.length > 9 ? '9+' : streetRequests.length || 0}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
