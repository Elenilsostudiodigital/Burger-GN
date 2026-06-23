import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { CheckCircle2, MessageCircle, Home } from 'lucide-react';
import { PageTransition } from '../components/PageTransition';
import { useCart } from '../context/CartContext';
import { WHATSAPP_NUMBER } from '../data/menu';
import { Button } from '@/components/ui/button';

interface StoredCheckoutData {
  nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  referencia: string;
  troco: string;
  orderType: 'delivery' | 'retirada' | 'local';
  paymentMethod: 'pix' | 'dinheiro' | 'cartao';
  total: number;
  deliveryFee: number;
  items: Array<{ name: string; quantity: number; price: number; subtotal: number }>;
}

function buildWhatsAppMessage(data: StoredCheckoutData): string {
  const itemsText = data.items
    .map(i => `• ${i.quantity}x ${i.name} - R$ ${i.subtotal.toFixed(2).replace('.', ',')}`)
    .join('\n');

  const orderTypeLabels = {
    delivery: '🛵 Delivery',
    retirada: '🏃 Retirada no local',
    local: '🍽️ Comer no local',
  };

  const paymentLabels = {
    pix: 'Pix',
    dinheiro: 'Dinheiro',
    cartao: 'Cartão',
  };

  let deliveryText = orderTypeLabels[data.orderType];
  if (data.orderType === 'delivery') {
    deliveryText += `\n📍 *Endereço:* ${data.endereco} - ${data.bairro}`;
    if (data.referencia) deliveryText += `\n📌 *Referência:* ${data.referencia}`;
  }

  let paymentText = paymentLabels[data.paymentMethod];
  if (data.paymentMethod === 'dinheiro' && data.troco) {
    paymentText += ` (troco para R$ ${data.troco})`;
  }

  const subtotal = data.total - data.deliveryFee;
  const deliveryLine =
    data.deliveryFee > 0
      ? `🚴 *Entrega:* R$ ${data.deliveryFee.toFixed(2).replace('.', ',')}`
      : `🚴 *Entrega:* Grátis`;

  return `🍔 *NOVO PEDIDO - The Burger GN*

👤 *Cliente:* ${data.nome}
📱 *Telefone:* ${data.telefone}

📦 *Tipo:* ${deliveryText}

🛒 *Itens do Pedido:*
${itemsText}

💰 *Subtotal:* R$ ${subtotal.toFixed(2).replace('.', ',')}
${deliveryLine}
💵 *TOTAL: R$ ${data.total.toFixed(2).replace('.', ',')}*

💳 *Pagamento:* ${paymentText}

Obrigado! 🙏`;
}

export default function Confirmation() {
  const [, setLocation] = useLocation();
  const { cartItems, clearCart } = useCart();

  // Capture order data into a ref on mount so it survives clearCart()
  const orderDataRef = useRef<StoredCheckoutData | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [ready, setReady] = useState(false);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const raw = sessionStorage.getItem('checkoutData');
    if (!raw || cartItems.length === 0) {
      setLocation('/');
      return;
    }

    const base = JSON.parse(raw) as Omit<StoredCheckoutData, 'items'>;

    // Snapshot cart items NOW before any clearCart call
    const items = cartItems.map(ci => ({
      name: ci.item.name,
      quantity: ci.quantity,
      price: ci.item.price,
      subtotal: ci.item.price * ci.quantity,
    }));

    const fullData: StoredCheckoutData = { ...base, items };
    orderDataRef.current = fullData;

    const message = buildWhatsAppMessage(fullData);
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
    setWhatsappUrl(url);
    setReady(true);

    // Clear cart and session data after a short delay so the page can render first
    const timer = setTimeout(() => {
      clearCart();
      sessionStorage.removeItem('checkoutData');
      // Auto-open WhatsApp
      window.open(url, '_blank');
    }, 1800);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageTransition className="bg-[#0a0a0a] min-h-screen flex flex-col items-center justify-center p-6 text-center">
      {/* Animated checkmark */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
        className="relative w-36 h-36 flex items-center justify-center mb-8"
      >
        <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" style={{ animationDuration: '2.5s' }} />
        <div className="w-36 h-36 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
          <CheckCircle2 size={72} className="text-amber-500" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="text-4xl font-black text-white uppercase tracking-tighter mb-3"
      >
        Pedido Enviado!
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="text-zinc-400 text-base mb-2 max-w-[300px] leading-relaxed"
      >
        Abrindo o WhatsApp para confirmar seu pedido com a gente...
      </motion.p>

      {orderDataRef.current && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="text-zinc-500 text-sm mb-10"
        >
          {orderDataRef.current.items.length} {orderDataRef.current.items.length === 1 ? 'item' : 'itens'} •{' '}
          <span className="text-amber-500 font-bold">
            R$ {orderDataRef.current.total.toFixed(2).replace('.', ',')}
          </span>
        </motion.div>
      )}

      {!orderDataRef.current && !ready && (
        <p className="text-zinc-500 text-sm mb-10">Preparando seu pedido...</p>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="w-full max-w-sm space-y-3"
      >
        {/* Manual WhatsApp button */}
        <a
          href={whatsappUrl || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full"
          aria-disabled={!whatsappUrl}
        >
          <Button
            size="lg"
            disabled={!whatsappUrl}
            className="w-full min-h-[60px] text-base font-bold tracking-wider rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white flex items-center justify-center gap-2 shadow-lg shadow-green-900/30"
          >
            <MessageCircle size={22} />
            ENVIAR PELO WHATSAPP
          </Button>
        </a>

        <Link href="/" className="block w-full">
          <Button
            variant="outline"
            size="lg"
            className="w-full min-h-[56px] font-bold tracking-wider rounded-2xl border-2 border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 flex items-center justify-center gap-2"
          >
            <Home size={18} />
            VOLTAR AO INÍCIO
          </Button>
        </Link>
      </motion.div>
    </PageTransition>
  );
}
