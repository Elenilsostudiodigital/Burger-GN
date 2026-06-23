import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { useCart } from '../context/CartContext';
import { PageTransition } from '../components/PageTransition';
import { DELIVERY_FEE } from './Cart';
import { ArrowLeft, Bike, Store, Utensils, CreditCard, Banknote, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type OrderType = 'delivery' | 'retirada' | 'local';
type PaymentMethod = 'pix' | 'dinheiro' | 'cartao';

interface CheckoutFormData {
  nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  referencia: string;
  troco: string;
}

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { cartItems, subtotal } = useCart();
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  
  const { register, handleSubmit, watch, formState: { errors } } = useForm<CheckoutFormData>();

  const isDelivery = orderType === 'delivery';
  const currentDeliveryFee = isDelivery ? DELIVERY_FEE : 0;
  const total = subtotal + currentDeliveryFee;

  const onSubmit = (data: CheckoutFormData) => {
    // Store checkout data in sessionStorage to pass to confirmation page
    sessionStorage.setItem('checkoutData', JSON.stringify({
      ...data,
      orderType,
      paymentMethod,
      total,
      deliveryFee: currentDeliveryFee
    }));
    
    setLocation('/confirmacao');
  };

  // Format phone number as user types
  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return value;
  };

  if (cartItems.length === 0) {
    setLocation('/cardapio');
    return null;
  }

  return (
    <PageTransition className="bg-[#0a0a0a]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 px-6 py-4">
        <div className="max-w-md mx-auto flex items-center">
          <button 
            onClick={() => setLocation('/carrinho')}
            className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors"
          >
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
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">1</span>
              Como você quer receber?
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setOrderType('delivery')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                  orderType === 'delivery' 
                    ? 'border-primary bg-primary/10 text-primary' 
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}
              >
                <Bike size={24} />
                <span className="text-[10px] uppercase font-bold text-center leading-tight">Delivery</span>
              </button>
              <button
                type="button"
                onClick={() => setOrderType('retirada')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                  orderType === 'retirada' 
                    ? 'border-primary bg-primary/10 text-primary' 
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}
              >
                <Store size={24} />
                <span className="text-[10px] uppercase font-bold text-center leading-tight">Retirar<br/>no local</span>
              </button>
              <button
                type="button"
                onClick={() => setOrderType('local')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                  orderType === 'local' 
                    ? 'border-primary bg-primary/10 text-primary' 
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}
              >
                <Utensils size={24} />
                <span className="text-[10px] uppercase font-bold text-center leading-tight">Comer<br/>no local</span>
              </button>
            </div>
          </section>

          {/* Personal Info */}
          <section className="space-y-4">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">2</span>
              Seus Dados
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-zinc-400">Nome completo</Label>
                <Input 
                  id="nome" 
                  placeholder="Ex: João da Silva" 
                  className="bg-zinc-900 border-zinc-800 h-12"
                  {...register('nome', { required: 'Nome é obrigatório' })}
                />
                {errors.nome && <span className="text-red-500 text-xs">{errors.nome.message}</span>}
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="telefone" className="text-zinc-400">Telefone (WhatsApp)</Label>
                <Input 
                  id="telefone" 
                  placeholder="(00) 00000-0000" 
                  className="bg-zinc-900 border-zinc-800 h-12"
                  {...register('telefone', { 
                    required: 'Telefone é obrigatório',
                    onChange: (e) => {
                      e.target.value = formatPhone(e.target.value);
                    }
                  })}
                />
                {errors.telefone && <span className="text-red-500 text-xs">{errors.telefone.message}</span>}
              </div>
            </div>
          </section>

          {/* Address (Only for delivery) */}
          {isDelivery && (
            <section className="space-y-4">
              <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">3</span>
                Endereço de Entrega
              </h2>
              <div className="space-y-4 bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                <div className="space-y-1.5">
                  <Label htmlFor="endereco" className="text-zinc-400">Rua e Número</Label>
                  <Input 
                    id="endereco" 
                    placeholder="Ex: Rua das Flores, 123" 
                    className="bg-zinc-950 border-zinc-800 h-12"
                    {...register('endereco', { required: isDelivery ? 'Endereço é obrigatório' : false })}
                  />
                  {errors.endereco && <span className="text-red-500 text-xs">{errors.endereco.message}</span>}
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="bairro" className="text-zinc-400">Bairro</Label>
                  <Input 
                    id="bairro" 
                    placeholder="Ex: Centro" 
                    className="bg-zinc-950 border-zinc-800 h-12"
                    {...register('bairro', { required: isDelivery ? 'Bairro é obrigatório' : false })}
                  />
                  {errors.bairro && <span className="text-red-500 text-xs">{errors.bairro.message}</span>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="referencia" className="text-zinc-400">Ponto de Referência</Label>
                  <Input 
                    id="referencia" 
                    placeholder="Ex: Próximo ao mercado" 
                    className="bg-zinc-950 border-zinc-800 h-12"
                    {...register('referencia', { required: isDelivery ? 'Referência é obrigatória' : false })}
                  />
                  {errors.referencia && <span className="text-red-500 text-xs">{errors.referencia.message}</span>}
                </div>
              </div>
            </section>
          )}

          {/* Payment Method */}
          <section className="space-y-4">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">
                {isDelivery ? '4' : '3'}
              </span>
              Forma de Pagamento
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('pix')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                  paymentMethod === 'pix' 
                    ? 'border-primary bg-primary/10 text-primary' 
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}
              >
                <QrCode size={24} />
                <span className="text-[10px] uppercase font-bold text-center leading-tight">Pix</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('dinheiro')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                  paymentMethod === 'dinheiro' 
                    ? 'border-primary bg-primary/10 text-primary' 
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}
              >
                <Banknote size={24} />
                <span className="text-[10px] uppercase font-bold text-center leading-tight">Dinheiro</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('cartao')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                  paymentMethod === 'cartao' 
                    ? 'border-primary bg-primary/10 text-primary' 
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}
              >
                <CreditCard size={24} />
                <span className="text-[10px] uppercase font-bold text-center leading-tight">Cartão</span>
              </button>
            </div>

            {paymentMethod === 'dinheiro' && (
              <div className="space-y-1.5 mt-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                <Label htmlFor="troco" className="text-zinc-400">Troco para quanto?</Label>
                <Input 
                  id="troco" 
                  placeholder="Ex: 100" 
                  className="bg-zinc-950 border-zinc-800 h-12"
                  {...register('troco')}
                />
                <p className="text-xs text-zinc-500 mt-1">Deixe em branco se não precisar de troco.</p>
              </div>
            )}
          </section>

          {/* Summary & Submit */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mt-8 sticky bottom-4 z-10 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-zinc-400 text-sm">Total a pagar</p>
                <p className="text-white font-black text-2xl">
                  R$ {total.toFixed(2).replace('.', ',')}
                </p>
                {!isDelivery && (
                  <p className="text-primary text-xs font-bold uppercase mt-1">Entrega Grátis</p>
                )}
              </div>
              <Button type="submit" size="lg" className="h-14 px-8 rounded-xl font-bold tracking-wider text-base">
                ENVIAR
              </Button>
            </div>
            <p className="text-xs text-zinc-500 text-center">Você será redirecionado para o WhatsApp.</p>
          </div>

        </form>
      </main>
    </PageTransition>
  );
}
