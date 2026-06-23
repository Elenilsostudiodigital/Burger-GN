import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { useCart } from '../context/CartContext';
import { PageTransition } from '../components/PageTransition';
import { createOrder, validateCoupon, DELIVERY_FEE, ValidateCouponResult } from '../lib/api';
import {
  ArrowLeft, Bike, Store, Utensils, CreditCard, Banknote, QrCode,
  Loader2, Tag, X, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';

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

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<ValidateCouponResult | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<CheckoutFormData>();

  const isDelivery = orderType === 'delivery';
  const currentDeliveryFee = isDelivery ? DELIVERY_FEE : 0;
  const discount = appliedCoupon?.discountAmount ?? 0;
  const total = Math.max(0, subtotal + currentDeliveryFee - discount);

  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    return value;
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const result = await validateCoupon(code, subtotal);
      if (result.valid) {
        setAppliedCoupon(result);
        setCouponInput('');
      } else {
        setCouponError(result.message ?? 'Cupom inválido');
      }
    } catch {
      setCouponError('Erro ao validar cupom');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError('');
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
        couponCode: appliedCoupon?.code,
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
        couponCode: appliedCoupon?.code ?? null,
        discountAmount: result.discountAmount ?? 0,
        items: cartItems.map(ci => ({ name: ci.item.name, quantity: ci.quantity, price: ci.item.price, subtotal: ci.item.price * ci.quantity })),
        subtotal,
        deliveryFee: currentDeliveryFee,
        discount,
        total,
      }));
      setLocation('/confirmacao');
    } catch {
      setSubmitError('Erro ao enviar pedido. Verifique a conexão e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0) { setLocation('/cardapio'); return null; }

  const stepNum = (n: number) => (
    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs font-black">{n}</span>
  );

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
              {stepNum(1)} Como você quer receber?
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'delivery', icon: <Bike size={22} />, label: 'Delivery' },
                { key: 'pickup', icon: <Store size={22} />, label: 'Retirar\nno balcão' },
                { key: 'local', icon: <Utensils size={22} />, label: 'Comer\nno local' },
              ] as const).map(opt => (
                <button key={opt.key} type="button" onClick={() => setOrderType(opt.key)}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${orderType === opt.key ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-900 text-zinc-400'}`}>
                  {opt.icon}
                  <span className="text-[10px] uppercase font-bold text-center leading-tight whitespace-pre-line">{opt.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Personal Info */}
          <section className="space-y-4">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              {stepNum(2)} Seus Dados
            </h2>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">Nome completo *</Label>
                <Input placeholder="Ex: João da Silva" className="bg-zinc-900 border-zinc-800 h-12 text-white focus:border-amber-500"
                  {...register('nome', { required: 'Nome é obrigatório' })} />
                {errors.nome && <span className="text-red-400 text-xs">{errors.nome.message}</span>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-sm">Telefone (WhatsApp) *</Label>
                <Input placeholder="(00) 00000-0000" className="bg-zinc-900 border-zinc-800 h-12 text-white focus:border-amber-500"
                  {...register('telefone', { required: 'Telefone é obrigatório', onChange: (e) => { e.target.value = formatPhone(e.target.value); } })} />
                {errors.telefone && <span className="text-red-400 text-xs">{errors.telefone.message}</span>}
              </div>
            </div>
          </section>

          {/* Address */}
          {isDelivery && (
            <section className="space-y-4">
              <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                {stepNum(3)} Endereço de Entrega
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
              {stepNum(isDelivery ? 4 : 3)} Observações do Pedido
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
              {stepNum(isDelivery ? 5 : 4)} Forma de Pagamento
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'pix', icon: <QrCode size={22} />, label: 'Pix' },
                { key: 'cash', icon: <Banknote size={22} />, label: 'Dinheiro' },
                { key: 'card', icon: <CreditCard size={22} />, label: 'Cartão' },
              ] as const).map(opt => (
                <button key={opt.key} type="button" onClick={() => setPaymentMethod(opt.key)}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${paymentMethod === opt.key ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-900 text-zinc-400'}`}>
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

          {/* Coupon */}
          <section className="space-y-3">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              {stepNum(isDelivery ? 6 : 5)} Cupom de Desconto
            </h2>

            <AnimatePresence mode="wait">
              {appliedCoupon ? (
                <motion.div
                  key="applied"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-center justify-between bg-green-900/20 border border-green-800/50 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-900/40 flex items-center justify-center">
                      <CheckCircle2 size={18} className="text-green-400" />
                    </div>
                    <div>
                      <p className="text-green-400 font-black text-sm uppercase tracking-wider">{appliedCoupon.code}</p>
                      <p className="text-green-600 text-xs">
                        {appliedCoupon.discountType === 'percentage'
                          ? `${appliedCoupon.discountValue}% de desconto`
                          : `${fmt(appliedCoupon.discountValue ?? 0)} de desconto`}
                        {' — '}<span className="font-bold text-green-400">-{fmt(appliedCoupon.discountAmount ?? 0)}</span>
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={handleRemoveCoupon}
                    className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20">
                    <X size={18} />
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="input"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <Input
                        value={couponInput}
                        onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleApplyCoupon())}
                        placeholder="CÓDIGO DO CUPOM"
                        className="bg-zinc-900 border-zinc-800 h-12 pl-9 text-white font-mono tracking-wider focus:border-amber-500 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans"
                      />
                    </div>
                    <Button type="button" onClick={handleApplyCoupon} disabled={couponLoading || !couponInput.trim()}
                      className="h-12 px-5 bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-300 font-bold rounded-xl transition-all">
                      {couponLoading ? <Loader2 size={16} className="animate-spin" /> : 'Aplicar'}
                    </Button>
                  </div>
                  {couponError && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-xs flex items-center gap-1.5 px-1">
                      <X size={12} /> {couponError}
                    </motion.p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
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
                  <span>{fmt(ci.item.price * ci.quantity)}</span>
                </div>
              ))}
              {isDelivery && (
                <div className="flex justify-between text-zinc-500 text-xs">
                  <span>Taxa de entrega</span><span>{fmt(DELIVERY_FEE)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-green-400 text-sm font-bold">
                  <span className="flex items-center gap-1"><Tag size={12} /> {appliedCoupon?.code}</span>
                  <span>-{fmt(discount)}</span>
                </div>
              )}
              <div className="border-t border-zinc-800 pt-2 flex justify-between font-bold text-white">
                <span>Total</span>
                <span className="text-amber-500 text-xl">{fmt(total)}</span>
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
