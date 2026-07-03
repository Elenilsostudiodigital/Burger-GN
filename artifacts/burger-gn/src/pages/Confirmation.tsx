import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { CheckCircle2, MessageCircle, Home, ExternalLink, Copy, Check, QrCode } from 'lucide-react';
import { PageTransition } from '../components/PageTransition';
import { useCart } from '../context/CartContext';
import { WHATSAPP_NUMBER, getWhatsappSettings, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PaymentStatus, trackOrder, PixPaymentResult } from '../lib/api';
import { Button } from '@/components/ui/button';

interface StoredOrder {
  trackingId: string; orderNumber: number;
  customerName: string; phone: string;
  orderType: 'delivery' | 'pickup' | 'local';
  paymentMethod: 'pix' | 'cash' | 'card';
  paymentStatus: PaymentStatus;
  changeFor: string | null;
  address: string; numero: string; complemento: string;
  neighborhood: string; reference: string; notes: string;
  distanceKm: number | null;
  customerLat: number | null; customerLng: number | null;
  couponCode: string | null; discountAmount: number;
  items: Array<{ name: string; quantity: number; price: number; addons?: Array<{ name: string; price: number }>; notes?: string; subtotal: number }>;
  subtotal: number; deliveryFee: number; discount: number; total: number;
  pixPayment: PixPaymentResult | null;
  createdAt: string;
}

function fullAddress(order: StoredOrder): string {
  let addr = `${order.address}, ${order.numero}`;
  if (order.complemento) addr += `, ${order.complemento}`;
  return addr;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR');
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} às ${time}`;
}

function buildWhatsAppMessage(order: StoredOrder): string {
  const itemsText = order.items.map(i => {
    let line = `• ${i.quantity}x ${i.name} — R$ ${i.subtotal.toFixed(2).replace('.', ',')}`;
    if (i.addons && i.addons.length > 0) {
      line += `\n   + ${i.addons.map(a => a.name).join(', ')}`;
    }
    if (i.notes) {
      line += `\n   Obs: ${i.notes}`;
    }
    return line;
  }).join('\n');

  let deliveryText = ORDER_TYPE_LABELS[order.orderType];
  if (order.orderType === 'delivery') {
    deliveryText += `\n📍 *Endereço:* ${fullAddress(order)}`;
    deliveryText += `\n🏘️ *Bairro:* ${order.neighborhood}`;
    if (order.reference) deliveryText += `\n📌 *Referência:* ${order.reference}`;
    if (order.distanceKm !== null) deliveryText += `\n📏 *Distância:* ${order.distanceKm.toFixed(1)} km`;
    if (order.customerLat !== null && order.customerLng !== null) {
      deliveryText += `\n🗺️ *Localização:* https://www.google.com/maps?q=${order.customerLat},${order.customerLng}`;
    }
  }

  let paymentText = PAYMENT_METHOD_LABELS[order.paymentMethod];
  if (order.paymentMethod === 'cash' && order.changeFor) {
    paymentText += ` (troco p/ R$ ${order.changeFor})`;
  }
  const paymentStatusText = PAYMENT_STATUS_LABELS[order.paymentStatus];

  const feeText = order.deliveryFee > 0
    ? `R$ ${order.deliveryFee.toFixed(2).replace('.', ',')}`
    : order.orderType === 'delivery' ? 'A consultar' : 'Grátis';

  const discountLine = order.discount > 0 && order.couponCode
    ? `\n🏷️ *Cupom ${order.couponCode}:* -R$ ${order.discount.toFixed(2).replace('.', ',')}`
    : '';

  return `🍔 *PEDIDO #${order.orderNumber} — The Burger GN*
🕒 *Data/Hora:* ${formatDateTime(order.createdAt)}

👤 *Cliente:* ${order.customerName}
📱 *Telefone:* ${order.phone}

📦 *Tipo de pedido:* ${deliveryText}
${order.notes ? `\n📝 *Observações:* ${order.notes}` : ''}
🛒 *Itens:*
${itemsText}

━━━━━━━━━━━━━━━━━
💰 *Subtotal:* R$ ${order.subtotal.toFixed(2).replace('.', ',')}
🚴 *Taxa de entrega:* ${feeText}${discountLine}
💵 *TOTAL: R$ ${order.total.toFixed(2).replace('.', ',')}*
━━━━━━━━━━━━━━━━━
💳 *Pagamento:* ${paymentText}
✅ *Status do pagamento:* ${paymentStatusText}

Aguardo confirmação! 🙏`;
}

export default function Confirmation() {
  const { clearCart } = useCart();
  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const raw = sessionStorage.getItem('lastOrder');
    if (!raw) return;
    const stored = JSON.parse(raw) as StoredOrder;
    setOrder(stored);
    sessionStorage.removeItem('lastOrder');
    getWhatsappSettings()
      .then(s => s.number)
      .catch(() => WHATSAPP_NUMBER)
      .then(number => {
        const url = `https://wa.me/${number}?text=${encodeURIComponent(buildWhatsAppMessage(stored))}`;
        setWhatsappUrl(url);
        setTimeout(() => { window.open(url, '_blank'); }, 1500);
      });
    clearCart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll payment status while a Pix payment is pending
  useEffect(() => {
    if (!order?.pixPayment || paid) return;
    const interval = setInterval(async () => {
      try {
        const fresh = await trackOrder(order.trackingId);
        if (fresh.paymentStatus === 'paid') { setPaid(true); clearInterval(interval); }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [order, paid]);

  const handleCopyPix = async () => {
    if (!order?.pixPayment) return;
    try {
      await navigator.clipboard.writeText(order.pixPayment.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  };

  return (
    <PageTransition className="bg-[#0a0a0a] min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        className="relative w-36 h-36 flex items-center justify-center mb-8">
        <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" style={{ animationDuration: '2.5s' }} />
        <div className="w-36 h-36 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
          <CheckCircle2 size={72} className="text-amber-500" />
        </div>
      </motion.div>

      <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="text-4xl font-black text-white uppercase tracking-tighter mb-2">
        Pedido Enviado!
      </motion.h1>

      {order && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mb-2 space-y-1">
          <p className="text-amber-500 font-black text-2xl">#{order.orderNumber}</p>
          {order.discount > 0 && order.couponCode && (
            <p className="text-green-400 text-sm font-bold">🏷️ Desconto de R$ {order.discount.toFixed(2).replace('.', ',')} aplicado!</p>
          )}
        </motion.div>
      )}

      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="text-zinc-400 text-base mb-6 max-w-[300px] leading-relaxed">
        Abrindo o WhatsApp para confirmar seu pedido...
      </motion.p>

      {order?.pixPayment && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
          className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6 text-left space-y-4">
          <div className="flex items-center gap-2 justify-center">
            <QrCode size={18} className="text-amber-500" />
            <h3 className="text-white font-black uppercase tracking-wide text-sm">Pague com Pix</h3>
          </div>
          {paid ? (
            <div className="flex items-center justify-center gap-2 bg-green-900/20 border border-green-800/40 rounded-xl py-4 text-green-400 font-bold">
              <CheckCircle2 size={20} /> Pagamento confirmado!
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${order.pixPayment.qrCodeBase64}`}
                  alt="QR Code Pix"
                  className="w-48 h-48 rounded-xl bg-white p-2"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-zinc-500 text-xs">Ou copie o código Pix (copia e cola):</p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-400 text-xs font-mono truncate">
                    {order.pixPayment.qrCode}
                  </div>
                  <button type="button" onClick={handleCopyPix}
                    className={`shrink-0 px-3 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${copied ? 'bg-green-500/20 text-green-400' : 'bg-amber-500 text-zinc-950 hover:bg-amber-400'}`}>
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
              <p className="text-zinc-600 text-xs text-center">Aguardando confirmação do pagamento...</p>
            </>
          )}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
        className="w-full max-w-sm space-y-3">
        <a href={whatsappUrl || undefined} target="_blank" rel="noopener noreferrer" className="block w-full">
          <Button size="lg" disabled={!whatsappUrl}
            className="w-full min-h-[60px] text-base font-bold tracking-wider rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white flex items-center justify-center gap-2">
            <MessageCircle size={22} /> ENVIAR PELO WHATSAPP
          </Button>
        </a>
        {order && (
          <Link href={`/pedido/${order.trackingId}`} className="block w-full">
            <Button variant="outline" size="lg"
              className="w-full min-h-[56px] font-bold tracking-wider rounded-2xl border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-900 flex items-center justify-center gap-2">
              <ExternalLink size={18} /> ACOMPANHAR PEDIDO
            </Button>
          </Link>
        )}
        <Link href="/" className="block w-full">
          <Button variant="ghost" size="lg"
            className="w-full min-h-[52px] font-bold tracking-wider rounded-2xl text-zinc-500 hover:text-white flex items-center justify-center gap-2">
            <Home size={18} /> Voltar ao início
          </Button>
        </Link>
      </motion.div>
    </PageTransition>
  );
}
