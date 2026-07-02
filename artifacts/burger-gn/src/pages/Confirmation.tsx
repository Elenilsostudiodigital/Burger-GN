import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { CheckCircle2, MessageCircle, Home, ExternalLink } from 'lucide-react';
import { PageTransition } from '../components/PageTransition';
import { useCart } from '../context/CartContext';
import { WHATSAPP_NUMBER, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../lib/api';
import { Button } from '@/components/ui/button';

interface StoredOrder {
  trackingId: string; orderNumber: number;
  customerName: string; phone: string;
  orderType: 'delivery' | 'pickup' | 'local';
  paymentMethod: 'pix' | 'cash' | 'card';
  changeFor: string | null;
  address: string; numero: string; complemento: string;
  neighborhood: string; reference: string; notes: string;
  distanceKm: number | null;
  couponCode: string | null; discountAmount: number;
  items: Array<{ name: string; quantity: number; price: number; addons?: Array<{ name: string; price: number }>; notes?: string; subtotal: number }>;
  subtotal: number; deliveryFee: number; discount: number; total: number;
}

function fullAddress(order: StoredOrder): string {
  let addr = `${order.address}, ${order.numero}`;
  if (order.complemento) addr += `, ${order.complemento}`;
  return addr;
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
  }

  let paymentText = PAYMENT_METHOD_LABELS[order.paymentMethod];
  if (order.paymentMethod === 'cash' && order.changeFor) {
    paymentText += ` (troco p/ R$ ${order.changeFor})`;
  }

  const feeText = order.deliveryFee > 0
    ? `R$ ${order.deliveryFee.toFixed(2).replace('.', ',')}`
    : order.orderType === 'delivery' ? 'A consultar' : 'Grátis';

  const discountLine = order.discount > 0 && order.couponCode
    ? `\n🏷️ *Cupom ${order.couponCode}:* -R$ ${order.discount.toFixed(2).replace('.', ',')}`
    : '';

  return `🍔 *PEDIDO #${order.orderNumber} — The Burger GN*

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

Aguardo confirmação! 🙏`;
}

export default function Confirmation() {
  const { clearCart } = useCart();
  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const raw = sessionStorage.getItem('lastOrder');
    if (!raw) return;
    const stored = JSON.parse(raw) as StoredOrder;
    setOrder(stored);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppMessage(stored))}`;
    setWhatsappUrl(url);
    clearCart();
    sessionStorage.removeItem('lastOrder');
    setTimeout(() => { window.open(url, '_blank'); }, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        className="text-zinc-400 text-base mb-10 max-w-[300px] leading-relaxed">
        Abrindo o WhatsApp para confirmar seu pedido...
      </motion.p>

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
