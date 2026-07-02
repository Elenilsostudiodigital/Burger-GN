import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { useCart } from '../context/CartContext';
import { PageTransition } from '../components/PageTransition';
import {
  createOrder, validateCoupon, getDeliveryZones, getDeliveryFee, getKmDeliveryConfig, geocodeAddress,
  haversineKm, findKmTier, getPaymentSettings,
  WHATSAPP_NUMBER, ValidateCouponResult, DeliveryZone, KmDeliveryConfig, PaymentSettingsPublic,
} from '../lib/api';
import {
  ArrowLeft, Bike, Store, Utensils, CreditCard, Banknote, QrCode,
  Loader2, Tag, X, CheckCircle2, MapPin, AlertCircle, ChevronDown, LocateFixed, Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';

type OrderType = 'delivery' | 'pickup' | 'local';
type PaymentMethod = 'pix' | 'cash' | 'card';

interface CheckoutFormData {
  nome: string; telefone: string;
  endereco: string; numero: string; complemento: string;
  bairro: string; referencia: string;
  observacoes: string; troco: string;
}

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { cartItems, subtotal } = useCart();
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Delivery zones (neighborhood fallback)
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeMessage, setFeeMessage] = useState('');
  const [feeFound, setFeeFound] = useState<boolean | null>(null);
  const feeDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // KM delivery (GPS/geocoding)
  const [kmConfig, setKmConfig] = useState<KmDeliveryConfig | null>(null);
  const kmEnabled = !!kmConfig?.enabled;
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');

  // Payment settings
  const [paySettings, setPaySettings] = useState<PaymentSettingsPublic | null>(null);

  // Coupon
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<ValidateCouponResult | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CheckoutFormData>();
  const bairroValue = watch('bairro');
  const enderecoValue = watch('endereco');
  const numeroValue = watch('numero');

  useEffect(() => {
    getDeliveryZones().then(setZones).catch(() => {});
    getKmDeliveryConfig().then(setKmConfig).catch(() => {});
    getPaymentSettings().then(setPaySettings).catch(() => {});
  }, []);

  // Cash restricted for delivery unless admin allows — auto-switch away if needed
  useEffect(() => {
    if (orderType === 'delivery' && paymentMethod === 'cash' && paySettings && !paySettings.cashOnDeliveryEnabled) {
      setPaymentMethod('pix');
    }
  }, [orderType, paymentMethod, paySettings]);

  // Neighborhood-based fee lookup (used only when KM mode is off, or as fallback with no GPS)
  useEffect(() => {
    if (orderType !== 'delivery' || kmEnabled || customerCoords || !bairroValue?.trim()) {
      if (!kmEnabled) { /* keep neighborhood flow */ } else return;
    }
    if (orderType !== 'delivery' || customerCoords || !bairroValue?.trim() || bairroValue === '__outro__') {
      if (!customerCoords) { setDeliveryFee(0); setFeeMessage(''); setFeeFound(null); }
      return;
    }
    clearTimeout(feeDebounce.current);
    feeDebounce.current = setTimeout(async () => {
      setFeeLoading(true);
      try {
        const result = await getDeliveryFee(bairroValue.trim());
        if (result.found && result.fee !== null) {
          setDeliveryFee(result.fee);
          setFeeMessage('');
          setFeeFound(true);
        } else {
          setDeliveryFee(0);
          setFeeMessage(result.message ?? 'Consulte a taxa de entrega pelo WhatsApp.');
          setFeeFound(false);
        }
      } catch {
        setFeeFound(null);
      } finally {
        setFeeLoading(false);
      }
    }, 500);
    return () => clearTimeout(feeDebounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bairroValue, orderType, customerCoords, kmEnabled]);

  const isDelivery = orderType === 'delivery';
  const usingKm = isDelivery && kmEnabled && customerCoords !== null;

  const applyCoordinates = (lat: number, lng: number) => {
    setCustomerCoords({ lat, lng });
    setGpsError('');
    if (kmConfig && kmConfig.enabled) {
      const baseLat = parseFloat(kmConfig.baseLat);
      const baseLng = parseFloat(kmConfig.baseLng);
      if (baseLat !== 0 || baseLng !== 0) {
        const dist = haversineKm(baseLat, baseLng, lat, lng);
        setDistanceKm(dist);
        const maxDist = parseFloat(kmConfig.maxDistanceKm);
        if (dist <= maxDist) {
          const { fee, consult } = findKmTier(dist, kmConfig.tiers);
          if (!consult && fee !== null) {
            setDeliveryFee(fee);
            setFeeFound(true);
            setFeeMessage('');
          } else {
            setDeliveryFee(0);
            setFeeFound(false);
            setFeeMessage('Distância fora das faixas cadastradas. Consulte pelo WhatsApp.');
          }
        } else {
          setDeliveryFee(0);
          setFeeFound(false);
          setFeeMessage(`Distância de ${dist.toFixed(1)}km excede o raio de entrega (${maxDist}km). Consulte pelo WhatsApp.`);
        }
      }
    }
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) { setGpsError('Seu navegador não suporta localização.'); return; }
    setGpsLoading(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      pos => { applyCoordinates(pos.coords.latitude, pos.coords.longitude); setGpsLoading(false); },
      () => { setGpsError('Não foi possível obter sua localização. Preencha o endereço manualmente.'); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Fallback: geocode typed address when KM mode is on and user hasn't used GPS
  useEffect(() => {
    if (!kmEnabled || !isDelivery || customerCoords || !enderecoValue?.trim() || !numeroValue?.trim() || !bairroValue?.trim() || bairroValue === '__outro__') return;
    clearTimeout(feeDebounce.current);
    feeDebounce.current = setTimeout(async () => {
      setFeeLoading(true);
      const fullAddr = `${enderecoValue}, ${numeroValue}, ${bairroValue}, Lauro de Freitas, Bahia, Brasil`;
      const coords = await geocodeAddress(fullAddr);
      if (coords) applyCoordinates(coords.lat, coords.lng);
      else { setFeeFound(false); setFeeMessage('Não foi possível localizar este endereço automaticamente. Consulte a taxa pelo WhatsApp.'); }
      setFeeLoading(false);
    }, 900);
    return () => clearTimeout(feeDebounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enderecoValue, numeroValue, bairroValue, kmEnabled, isDelivery, customerCoords]);

  const discount = appliedCoupon?.discountAmount ?? 0;
  const total = Math.max(0, subtotal + (isDelivery ? deliveryFee : 0) - discount);
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  const formatPhone = (v: string) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 11) return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    return v;
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true); setCouponError('');
    try {
      const result = await validateCoupon(code, subtotal);
      if (result.valid) { setAppliedCoupon(result); setCouponInput(''); }
      else setCouponError(result.message ?? 'Cupom inválido');
    } catch { setCouponError('Erro ao validar cupom'); }
    finally { setCouponLoading(false); }
  };

  const onSubmit = async (data: CheckoutFormData) => {
    if (cartItems.length === 0) { setLocation('/cardapio'); return; }
    setSubmitting(true); setSubmitError('');
    try {
      const result = await createOrder({
        customerName: data.nome, phone: data.telefone,
        address: isDelivery ? data.endereco : '',
        addressNumber: isDelivery ? data.numero : '',
        addressComplement: isDelivery ? data.complemento : '',
        neighborhood: isDelivery ? data.bairro : '',
        reference: isDelivery ? data.referencia : '',
        notes: data.observacoes,
        customerLat: isDelivery && customerCoords ? customerCoords.lat : undefined,
        customerLng: isDelivery && customerCoords ? customerCoords.lng : undefined,
        orderType, paymentMethod,
        changeFor: data.troco ? parseFloat(data.troco) : undefined,
        couponCode: appliedCoupon?.code,
        items: cartItems.map(ci => ({
          productId: ci.item.id, productName: ci.item.name,
          productPrice: ci.item.price, quantity: ci.quantity,
        })),
      });
      sessionStorage.setItem('lastOrder', JSON.stringify({
        trackingId: result.trackingId,
        orderNumber: result.orderNumber,
        customerName: data.nome, phone: data.telefone,
        orderType, paymentMethod,
        changeFor: data.troco || null,
        address: data.endereco, numero: data.numero,
        complemento: data.complemento,
        neighborhood: data.bairro, reference: data.referencia,
        notes: data.observacoes,
        distanceKm: result.distanceKm ?? null,
        couponCode: appliedCoupon?.code ?? null,
        discountAmount: result.discountAmount ?? 0,
        items: cartItems.map(ci => ({ name: ci.item.name, quantity: ci.quantity, price: ci.item.price, subtotal: ci.item.price * ci.quantity })),
        subtotal,
        deliveryFee: result.deliveryFee ?? 0,
        discount,
        total: result.deliveryFee !== undefined
          ? parseFloat((subtotal + result.deliveryFee - (result.discountAmount ?? 0)).toFixed(2))
          : total,
      }));
      setLocation('/confirmacao');
    } catch (err) {
      setSubmitError(err instanceof Error && err.message ? err.message : 'Erro ao enviar pedido. Verifique a conexão e tente novamente.');
    } finally { setSubmitting(false); }
  };

  if (cartItems.length === 0) { setLocation('/cardapio'); return null; }

  const stepNum = (n: number) => (
    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs font-black flex-shrink-0">{n}</span>
  );

  const cashBlockedForDelivery = isDelivery && paySettings !== null && !paySettings.cashOnDeliveryEnabled;

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

          {/* 1 – Tipo */}
          <section className="space-y-3">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              {stepNum(1)} Como você quer receber?
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'delivery', icon: <Bike size={22} />, label: 'Delivery' },
                { key: 'pickup',   icon: <Store size={22} />, label: 'Retirar\nno balcão' },
                { key: 'local',    icon: <Utensils size={22} />, label: 'Comer\nno local' },
              ] as const).map(opt => (
                <button key={opt.key} type="button" onClick={() => setOrderType(opt.key)}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${orderType === opt.key ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-900 text-zinc-400'}`}>
                  {opt.icon}
                  <span className="text-[10px] uppercase font-bold text-center leading-tight whitespace-pre-line">{opt.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 2 – Dados */}
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
                  {...register('telefone', { required: 'Telefone é obrigatório', onChange: e => { e.target.value = formatPhone(e.target.value); } })} />
                {errors.telefone && <span className="text-red-400 text-xs">{errors.telefone.message}</span>}
              </div>
            </div>
          </section>

          {/* 3 – Endereço (delivery only) */}
          {isDelivery && (
            <section className="space-y-4">
              <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                {stepNum(3)} <MapPin size={16} className="text-amber-500" /> Endereço de Entrega
              </h2>

              {kmEnabled && (
                <Button type="button" onClick={handleUseLocation} disabled={gpsLoading}
                  className="w-full h-12 bg-amber-500/10 border border-amber-500/40 text-amber-500 hover:bg-amber-500/20 font-bold rounded-xl flex items-center justify-center gap-2">
                  {gpsLoading ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
                  Usar minha localização
                </Button>
              )}
              {gpsError && <p className="text-orange-400 text-xs flex items-center gap-1.5"><AlertCircle size={13} /> {gpsError}</p>}
              {usingKm && distanceKm !== null && (
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm">
                  <Navigation size={15} className="text-amber-500" />
                  <span className="text-zinc-300">Distância até você: <span className="text-amber-500 font-bold">{distanceKm.toFixed(1)} km</span></span>
                </div>
              )}

              <div className="space-y-3 bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                {/* Street + Number in one row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Rua / Logradouro *</Label>
                    <Input placeholder="Ex: Rua das Flores" className="bg-zinc-950 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                      {...register('endereco', { required: 'Endereço é obrigatório' })} />
                    {errors.endereco && <span className="text-red-400 text-xs">{errors.endereco.message}</span>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Número *</Label>
                    <Input placeholder="123" className="bg-zinc-950 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                      {...register('numero', { required: 'Número obrigatório' })} />
                    {errors.numero && <span className="text-red-400 text-xs">{errors.numero.message}</span>}
                  </div>
                </div>

                {/* Complement */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Complemento</Label>
                  <Input placeholder="Ex: Apto 12, Bloco B, Casa dos fundos" className="bg-zinc-950 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                    {...register('complemento')} />
                </div>

                {/* Neighborhood with zone select */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Bairro *</Label>
                  {zones.length > 0 && !kmEnabled ? (
                    <div className="relative">
                      <select
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 h-11 text-white text-sm focus:border-amber-500 focus:outline-none appearance-none pr-8"
                        {...register('bairro', { required: 'Bairro é obrigatório' })}
                        defaultValue=""
                      >
                        <option value="" disabled>Selecione seu bairro</option>
                        {zones.map(z => (
                          <option key={z.id} value={z.neighborhood}>{z.neighborhood}</option>
                        ))}
                        <option value="__outro__">Outro bairro</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                    </div>
                  ) : (
                    <Input placeholder="Ex: Centro" className="bg-zinc-950 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                      {...register('bairro', { required: 'Bairro é obrigatório' })} />
                  )}
                  {errors.bairro && <span className="text-red-400 text-xs">{errors.bairro.message}</span>}
                </div>

                {/* Fee indicator */}
                <AnimatePresence>
                  {bairroValue && bairroValue !== '__outro__' && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      {feeLoading ? (
                        <div className="flex items-center gap-2 text-zinc-500 text-sm">
                          <Loader2 size={14} className="animate-spin" /> Calculando taxa de entrega...
                        </div>
                      ) : feeFound === true ? (
                        <div className="flex items-center justify-between bg-green-900/20 border border-green-800/40 rounded-xl px-4 py-2.5">
                          <div className="flex items-center gap-2 text-green-400">
                            <CheckCircle2 size={16} />
                            <span className="text-sm font-bold">Taxa de entrega{usingKm ? '' : ` para ${bairroValue}`}</span>
                          </div>
                          <span className="text-green-400 font-black">{fmt(deliveryFee)}</span>
                        </div>
                      ) : feeFound === false ? (
                        <div className="flex items-start gap-2 bg-orange-900/20 border border-orange-800/40 rounded-xl px-4 py-2.5">
                          <AlertCircle size={16} className="text-orange-400 mt-0.5 shrink-0" />
                          <p className="text-orange-400 text-sm">
                            {feeMessage}{' '}
                            <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="underline font-bold">
                              Chamar no WhatsApp
                            </a>
                          </p>
                        </div>
                      ) : null}
                    </motion.div>
                  )}
                  {bairroValue === '__outro__' && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <div className="flex items-start gap-2 bg-orange-900/20 border border-orange-800/40 rounded-xl px-4 py-2.5">
                        <AlertCircle size={16} className="text-orange-400 mt-0.5 shrink-0" />
                        <p className="text-orange-400 text-sm">
                          Consulte a taxa de entrega pelo{' '}
                          <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="underline font-bold">
                            WhatsApp
                          </a>
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Reference */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Ponto de Referência</Label>
                  <Input placeholder="Ex: Próximo ao mercado" className="bg-zinc-950 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                    {...register('referencia')} />
                </div>
              </div>
            </section>
          )}

          {/* 4 – Observações */}
          <section className="space-y-3">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              {stepNum(isDelivery ? 4 : 3)} Observações do Pedido
            </h2>
            <textarea placeholder="Ex: Sem cebola, ponto bem passado..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm resize-none focus:border-amber-500 focus:outline-none h-20 placeholder:text-zinc-600"
              {...register('observacoes')} />
          </section>

          {/* 5 – Pagamento */}
          <section className="space-y-4">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              {stepNum(isDelivery ? 5 : 4)} Forma de Pagamento
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'pix', icon: <QrCode size={22} />, label: 'Pix' },
                { key: 'cash', icon: <Banknote size={22} />, label: 'Dinheiro', blocked: cashBlockedForDelivery },
                { key: 'card', icon: <CreditCard size={22} />, label: 'Cartão' },
              ] as const).map(opt => (
                <button key={opt.key} type="button" disabled={'blocked' in opt && opt.blocked}
                  onClick={() => setPaymentMethod(opt.key)}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all relative ${
                    'blocked' in opt && opt.blocked
                      ? 'border-zinc-900 bg-zinc-950 text-zinc-700 cursor-not-allowed opacity-50'
                      : paymentMethod === opt.key ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                  }`}>
                  {opt.icon}
                  <span className="text-[10px] uppercase font-bold">{opt.label}</span>
                </button>
              ))}
            </div>
            {cashBlockedForDelivery && (
              <p className="text-zinc-600 text-xs flex items-center gap-1.5">
                <AlertCircle size={12} /> Dinheiro disponível apenas para retirada no balcão.
              </p>
            )}
            {!paySettings?.onlinePaymentEnabled && (paymentMethod === 'pix' || paymentMethod === 'card') && (
              <p className="text-zinc-600 text-xs">
                Pagamento combinado na entrega/retirada — confirmação final acontece pelo WhatsApp.
              </p>
            )}
            {paymentMethod === 'cash' && (
              <div className="space-y-1.5 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                <Label className="text-zinc-400 text-sm">Troco para quanto?</Label>
                <Input placeholder="Ex: 100" className="bg-zinc-950 border-zinc-800 h-12 text-white focus:border-amber-500"
                  {...register('troco')} />
                <p className="text-xs text-zinc-600">Deixe em branco se não precisar de troco.</p>
              </div>
            )}
          </section>

          {/* 6 – Cupom */}
          <section className="space-y-3">
            <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              {stepNum(isDelivery ? 6 : 5)} Cupom de Desconto
            </h2>
            <AnimatePresence mode="wait">
              {appliedCoupon ? (
                <motion.div key="applied" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-center justify-between bg-green-900/20 border border-green-800/50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-green-400 shrink-0" />
                    <div>
                      <p className="text-green-400 font-black text-sm uppercase">{appliedCoupon.code}</p>
                      <p className="text-green-600 text-xs">
                        {appliedCoupon.discountType === 'percentage' ? `${appliedCoupon.discountValue}%` : fmt(appliedCoupon.discountValue ?? 0)} de desconto
                        {' — '}<span className="font-bold text-green-400">-{fmt(appliedCoupon.discountAmount ?? 0)}</span>
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setAppliedCoupon(null); setCouponError(''); }}
                    className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20">
                    <X size={18} />
                  </button>
                </motion.div>
              ) : (
                <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <Input value={couponInput}
                        onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleApplyCoupon())}
                        placeholder="CÓDIGO DO CUPOM"
                        className="bg-zinc-900 border-zinc-800 h-12 pl-9 text-white font-mono tracking-wider focus:border-amber-500 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans" />
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

          {submitError && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm text-center">{submitError}</div>
          )}

          {/* Sticky summary */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sticky bottom-4 z-10 shadow-2xl">
            <div className="space-y-1.5 mb-4 text-sm">
              {cartItems.map(ci => (
                <div key={ci.item.id} className="flex justify-between text-zinc-400">
                  <span>{ci.quantity}x {ci.item.name}</span><span>{fmt(ci.item.price * ci.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between text-zinc-500 text-xs pt-1">
                <span>Subtotal</span><span className="text-zinc-300">{fmt(subtotal)}</span>
              </div>
              {isDelivery && (
                <div className="flex justify-between text-zinc-500 text-xs">
                  <span>Taxa de entrega {usingKm && distanceKm !== null ? `(${distanceKm.toFixed(1)}km)` : ''}</span>
                  <span className={feeFound === true ? 'text-zinc-300' : 'text-orange-400'}>
                    {feeFound === true ? fmt(deliveryFee) : feeFound === false ? 'A consultar' : 'A calcular'}
                  </span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-green-400 text-sm font-bold">
                  <span className="flex items-center gap-1"><Tag size={12} /> {appliedCoupon?.code}</span>
                  <span>-{fmt(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-500 text-xs">
                <span>Pagamento</span>
                <span className="text-zinc-300">{paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'cash' ? 'Dinheiro' : 'Cartão'}</span>
              </div>
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
