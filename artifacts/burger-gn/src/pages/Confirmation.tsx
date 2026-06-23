import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { CheckCircle2, MessageCircle, Home, ExternalLink } from 'lucide-react';
import { PageTransition } from '../components/PageTransition';
import { useCart } from '../context/CartContext';
import { WHATSAPP_NUMBER, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../lib/api';
import { Button } from '@/components/ui/button';

interface StoredOrder {
  trackingId: string;
  orderNumber: number;
  customerName: string;
  phone: string;
  orderType: 'delivery' | 'pickup' | 'local';
  paymentMethod: 'pix' | 'cash' | 'card';
  changeFor: string | null;
  address: string;
  neighborhood: string;
  reference: string;
  notes: string;
  items: Array<{ name: string; quantity: number; price: number; subtotal: number }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
}

function buildWhatsAppMessage(order: StoredOrder): string {
  const itemsText = order.items.map(i =>
    `• ${i.quantity}x ${i.name} - R$ ${i.subtotal.toFixed(2).replace('.', ',')}`
  ).join('\n');

  let deliveryText = ORDER_TYPE_LABELS[order.orderType];
  if (order.orderType === 'delivery') {
    deliveryText += `\n📍 *Endereço:* ${order.address}, ${order.neighborhood}`;
    if (order.reference) deliveryText += `\n📌 *Ref.:* ${order.reference}`;
  }

  let paymentText = PAYMENT_METHOD_LABELS[order.paymentMethod];
  if (order.paymentMethod === 'cash' && order.changeFor) {
    paymentText += ` (troco p/ R$ ${order.changeFor})`;
  }

  return `🍔 *NOVO PEDIDO #${order.orderNumber} - The Burger GN*

👤 *Cliente:* ${order.customerName}
📱 *Telefone:* ${order.phone}

📦 *Tipo:* ${deliveryText}
${order.notes ? `📝 *Obs.:* ${order.notes}` : ''}

🛒 *Itens:*
${itemsText}

💰 *Subtotal:* R$ ${order.subtotal.toFixed(2).replace('.', ',')}
🚴 *Entrega:* ${order.deliveryFee > 0 ? `R$ ${order.deliveryFee.toFixed(2).replace('.', ',')}` : 'Grátis'}
💵 *TOTAL: R$ ${order.total.toFixed(2).replace('.', ',')}*

💳 *Pagamento:* ${paymentText}

Obrigado! 🙏`;
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

    const message = buildWhatsAppMessage(stored);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    setWhatsappUrl(url);

    clearCart();
    sessionStorage.removeItem('lastOrder');

    setTimeout(() => { window.open(url, '_blank'); }, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageTransition className="bg-[#0a0a0a] min-h-screen flex flex-col items-center justify-center p-6 text-center">
      {/* Check animation */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        className="relative w-36 h-36 flex items-center justify-center mb-8"
      >
        <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" style={{ animationDuration: '2.5s' }} />
        <div className="w-36 h-36 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
          <CheckCircle2 size={72} className="text-amber-500" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="text-4xl font-black text-white uppercase tracking-tighter mb-2"
      >
        Pedido Enviado!
      </motion.h1>

      {order && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="mb-2"
        >
          <p className="text-amber-500 font-black text-2xl">#{order.orderNumber}</p>
        </motion.div>
      )}

      <motion.p
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="text-zinc-400 text-base mb-10 max-w-[300px] leading-relaxed"
      >
        Abrindo o WhatsApp para confirmar seu pedido...
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
        className="w-full max-w-sm space-y-3"
      >
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
