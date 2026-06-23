import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { PageTransition } from '../components/PageTransition';
import { useCart } from '../context/CartContext';
import { WHATSAPP_NUMBER } from '../data/menu';
import { Button } from '@/components/ui/button';

export default function Confirmation() {
  const [, setLocation] = useLocation();
  const { cartItems, clearCart } = useCart();
  const [orderSent, setOrderSent] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState('');

  useEffect(() => {
    // Retrieve checkout data
    const checkoutDataStr = sessionStorage.getItem('checkoutData');
    if (!checkoutDataStr || cartItems.length === 0) {
      if (!orderSent) setLocation('/');
      return;
    }

    const checkoutData = JSON.parse(checkoutDataStr);
    
    // Format cart items for WhatsApp message
    const itemsText = cartItems.map(item => 
      `• ${item.quantity}x ${item.item.name} - R$ ${(item.item.price * item.quantity).toFixed(2).replace('.', ',')}`
    ).join('\n');

    // Format address/delivery info
    let deliveryText = '';
    if (checkoutData.orderType === 'delivery') {
      deliveryText = `📦 *Tipo:* Delivery
📍 *Endereço:* ${checkoutData.endereco} - ${checkoutData.bairro}
📌 *Referência:* ${checkoutData.referencia}`;
    } else if (checkoutData.orderType === 'retirada') {
      deliveryText = `📦 *Tipo:* Retirada no local`;
    } else {
      deliveryText = `🍽️ *Tipo:* Comer no local`;
    }

    // Format payment info
    let paymentText = checkoutData.paymentMethod.toUpperCase();
    if (checkoutData.paymentMethod === 'dinheiro' && checkoutData.troco) {
      paymentText += ` (Troco para R$ ${checkoutData.troco})`;
    }

    // Build the full message
    const message = `🍔 *NOVO PEDIDO - The Burger GN*

👤 *Cliente:* ${checkoutData.nome}
📱 *Telefone:* ${checkoutData.telefone}

${deliveryText}

🛒 *Itens do Pedido:*
${itemsText}

💰 *Subtotal:* R$ ${(checkoutData.total - checkoutData.deliveryFee).toFixed(2).replace('.', ',')}
🚴 *Entrega:* R$ ${checkoutData.deliveryFee.toFixed(2).replace('.', ',')}
💵 *TOTAL: R$ ${checkoutData.total.toFixed(2).replace('.', ',')}*

💳 *Pagamento:* ${paymentText}

Obrigado! 🙏`;

    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;
    setWhatsappUrl(url);

    // Auto open WhatsApp
    setTimeout(() => {
      window.open(url, '_blank');
      setOrderSent(true);
      clearCart();
      sessionStorage.removeItem('checkoutData');
    }, 1500);

  }, [cartItems, clearCart, setLocation, orderSent]);

  return (
    <PageTransition className="bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
        className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center mb-8 relative"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.4 }}
          className="absolute inset-0 bg-primary/20 rounded-full animate-ping"
          style={{ animationDuration: '3s' }}
        />
        <CheckCircle2 size={64} className="text-primary relative z-10" />
      </motion.div>

      <motion.h1 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-4xl font-black text-white uppercase tracking-tighter mb-4"
      >
        Pedido Enviado!
      </motion.h1>

      <motion.p 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="text-zinc-400 text-lg mb-12 max-w-[280px]"
      >
        Abrindo WhatsApp para confirmar seu pedido...
      </motion.p>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="w-full space-y-4"
      >
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="block w-full">
          <Button size="lg" className="w-full min-h-[60px] text-lg font-bold tracking-wider rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white flex items-center gap-2">
            <MessageCircle size={24} />
            ENVIAR PELO WHATSAPP
          </Button>
        </a>
        
        <Link href="/" className="block w-full">
          <Button variant="outline" size="lg" className="w-full min-h-[60px] text-lg font-bold tracking-wider rounded-2xl border-2 border-zinc-800 bg-transparent text-white hover:bg-zinc-900">
            VOLTAR AO INÍCIO
          </Button>
        </Link>
      </motion.div>
    </PageTransition>
  );
}
