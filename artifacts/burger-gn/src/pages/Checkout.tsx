import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { useCart } from '../context/CartContext';
import { PageTransition } from '../components/PageTransition';
import { createOrder, DELIVERY_FEE } from '../lib/api';
import { ArrowLeft, Bike, Store, Utensils, CreditCard, Banknote, QrCode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type OrderType = 'delivery' | 'pickup' | 'local';
type PaymentMethod = 'pix' | 'cash' | 'card';

interface CheckoutFormData {
  nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  referencia: string;
  observacoes: string;
  troco: string;
}

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { cartItems, subtotal } = useCart();
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<CheckoutFormData>();

  const isDelivery = orderType === 'delivery';
  const currentDeliveryFee = isDelivery ? DELIVERY_FEE : 0;
  const total = subtotal + currentDeliveryFee;

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return value;
  };

  const onSubmit = async (data: CheckoutFormData) => {
    if (cartItems.length === 0) { setLocation('/cardapio'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await createOrder({
        customerName: data.nome,
        phone: data.telefone,
        address: isDelivery ? data.endereco : '',
        neighborhood: isDelivery ? data.bairro : '',
        reference: isDelivery ? data.referencia : '',
        notes: data.observacoes,
        orderType,
        paymentMethod,
        changeFor: data.troco ? parseFloat(data.troco) : undefined,
        items: cartItems.map(ci => ({
          productId: ci.item.id,
          productName: ci.item.name,
          productPrice: ci.item.price,
          quantity: ci.quantity,
        })),
      });
      sessionStorage.setItem('lastOrder', JSON.stringify({
        trackingId: result.trackingId,
        orderNumber: result.orderNumber,
        customerName: data.nome,
        phone: data.telefone,
        orderType,
        paymentMethod,
        changeFor: data.troco || null,
        address: data.endereco,
        neighborhood: data.bairro,
        reference: data.referencia,
        notes: data.observacoes,
        items: cartItems.map(ci => ({ name: ci.item.name, quantity: ci.quantity, price: ci.item.price, subtotal: ci.item.price * ci.quantity })),
        subtotal,
        deliveryFee: currentDeliveryFee,
        total,
      }));
      setLocation('/confirmacao');
    } catch (err) {
      setSubmitError('Erro ao enviar pedido. Verifique a conexão e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0) { setLocation('/cardapio'); return null; }

  return (
    <PageTransition className="bg-[#0a0a0a]">
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 px-6 py-4">
        <div className="max-w-md mx-auto flex items-center">
          <button onClick={() => setLocation('/carrinho')} className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-black text-white uppercase tracking-tight ml-2">Finalizar Pedido</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 pb-12">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

          {/* Order Type */}
          <section className="space-y-3">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs font-black">1</span>
              Como você quer receber?
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'delivery', icon: <Bike size={22} />, label: 'Delivery' },
                { key: 'pickup', icon: <Store size={22} />, label: 'Retirar\nno balcão' },
                { key: 'local', icon: <Utensils size={22} />, label: 'Comer\nno local' },
              ] as const).map(opt => (
                <button key={opt.key} type="button" onClick={() => setOrderType(opt.key)}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                    orderType === opt.key ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                  }`}>
                  {opt.icon}
                  <span className="text-[10px] uppercase font-bold text-center leading-tight whitespace-pre-line">{opt.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Personal Info */}
          <section className="space-y-4">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs font-black">2</span>
              Seus Dados
            </h2>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-zinc-400 text-sm">Nome completo *</Label>
                <Input id="nome" placeholder="Ex: João da Silva" className="bg-zinc-900 border-zinc-800 h-12 text-white focus:border-amber-500"
                  {...register('nome', { required: 'Nome é obrigatório' })} />
                {errors.nome && <span className="text-red-400 text-xs">{errors.nome.message}</span>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telefone" className="text-zinc-400 text-sm">Telefone (WhatsApp) *</Label>
                <Input id="telefone" placeholder="(00) 00000-0000" className="bg-zinc-900 border-zinc-800 h-12 text-white focus:border-amber-500"
                  {...register('telefone', {
                    required: 'Telefone é obrigatório',
                    onChange: (e) => { e.target.value = formatPhone(e.target.value); }
                  })} />
                {errors.telefone && <span className="text-red-400 text-xs">{errors.telefone.message}</span>}
              </div>
            </div>
          </section>

          {/* Address (Delivery only) */}
          {isDelivery && (
            <section className="space-y-4">
              <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs font-black">3</span>
                Endereço de Entrega
              </h2>
              <div className="space-y-3 bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-sm">Rua e Número *</Label>
                  <Input placeholder="Ex: Rua das Flores, 123" className="bg-zinc-950 border-zinc-800 h-12 text-white focus:border-amber-500"
                    {...register('endereco', { required: isDelivery ? 'Endereço é obrigatório' : false })} />
                  {errors.endereco && <span className="text-red-400 text-xs">{errors.endereco.message}</span>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-sm">Bairro *</Label>
                  <Input placeholder="Ex: Centro" className="bg-zinc-950 border-zinc-800 h-12 text-white focus:border-amber-500"
                    {...register('bairro', { required: isDelivery ? 'Bairro é obrigatório' : false })} />
                  {errors.bairro && <span className="text-red-400 text-xs">{errors.bairro.message}</span>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-sm">Ponto de Referência</Label>
                  <Input placeholder="Ex: Próximo ao mercado" className="bg-zinc-950 border-zinc-800 h-12 text-white focus:border-amber-500"
                    {...register('referencia')} />
                </div>
              </div>
            </section>
          )}

          {/* Observations */}
          <section className="space-y-3">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs font-black">
                {isDelivery ? '4' : '3'}
              </span>
              Observações do Pedido
            </h2>
            <textarea
              placeholder="Ex: Sem cebola, ponto da carne bem passado..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm resize-none focus:border-amber-500 focus:outline-none h-20 placeholder:text-zinc-600"
              {...register('observacoes')}
            />
          </section>

          {/* Payment */}
          <section className="space-y-4">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs font-black">
                {isDelivery ? '5' : '4'}
              </span>
              Forma de Pagamento
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'pix', icon: <QrCode size={22} />, label: 'Pix' },
                { key: 'cash', icon: <Banknote size={22} />, label: 'Dinheiro' },
                { key: 'card', icon: <CreditCard size={22} />, label: 'Cartão' },
              ] as const).map(opt => (
                <button key={opt.key} type="button" onClick={() => setPaymentMethod(opt.key)}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                    paymentMethod === opt.key ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                  }`}>
                  {opt.icon}
                  <span className="text-[10px] uppercase font-bold">{opt.label}</span>
                </button>
              ))}
            </div>
            {paymentMethod === 'cash' && (
              <div className="space-y-1.5 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                <Label className="text-zinc-400 text-sm">Troco para quanto?</Label>
                <Input placeholder="Ex: 100" className="bg-zinc-950 border-zinc-800 h-12 text-white focus:border-amber-500"
                  {...register('troco')} />
                <p className="text-xs text-zinc-600">Deixe em branco se não precisar de troco.</p>
              </div>
            )}
          </section>

          {/* Error */}
          {submitError && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm text-center">
              {submitError}
            </div>
          )}

          {/* Summary + Submit */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sticky bottom-4 z-10 shadow-2xl">
            <div className="space-y-1.5 mb-4 text-sm">
              {cartItems.map(ci => (
                <div key={ci.item.id} className="flex justify-between text-zinc-400">
                  <span>{ci.quantity}x {ci.item.name}</span>
                  <span>R$ {(ci.item.price * ci.quantity).toFixed(2).replace('.', ',')}</span>
                </div>
              ))}
              {isDelivery && (
                <div className="flex justify-between text-zinc-500 text-xs">
                  <span>Entrega</span><span>R$ {DELIVERY_FEE.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div className="border-t border-zinc-800 pt-2 flex justify-between font-bold text-white">
                <span>Total</span>
                <span className="text-amber-500 text-xl">R$ {total.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
            <Button type="submit" disabled={submitting} size="lg"
              className="w-full min-h-[56px] font-bold tracking-wider rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-base">
              {submitting ? <><Loader2 size={20} className="animate-spin mr-2" /> Enviando...</> : 'CONFIRMAR PEDIDO'}
            </Button>
            <p className="text-xs text-zinc-600 text-center mt-2">Você será redirecionado para o WhatsApp.</p>
          </div>
        </form>
      </main>
    </PageTransition>
  );
}
