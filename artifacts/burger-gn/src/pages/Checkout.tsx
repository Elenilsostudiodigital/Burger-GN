import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useCart } from '../context/CartContext';
import { PageTransition } from '../components/PageTransition';
import {
  createOrder, validateCoupon, getDeliveryZones, getDeliveryFee, getKmDeliveryConfig,
  geocodeAddress, reverseGeocode, haversineKm, findKmTier, getPaymentSettings,
  checkDeliveryStreet, resolveDeliveryArea, requestDeliveryAreaAnalysis,
  ValidateCouponResult, DeliveryZone, KmDeliveryConfig, PaymentSettingsPublic,
} from '../lib/api';
import { saveMyOrder } from '../lib/myOrder';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { StreetMapPreview } from '../components/StreetMapPreview';
import { StoreClosedBanner, useStoreStatus } from '../components/StoreClosedBanner';
import {
  ClubeFidelityRedeemPrompt,
  FidelityRedeemSelection,
} from '../components/ClubeFidelityRedeemPrompt';
import { ClubeCashbackCheckoutCard } from '../components/ClubeCashbackCheckoutCard';
import { getSavedClubePhone } from '../lib/clubeCliente';
import { setPresenceIdentity } from '../lib/menuPresence';
import {
  ArrowLeft, Bike, Store, Utensils, CreditCard, Banknote, QrCode, Star,
  Loader2, Tag, X, CheckCircle2, MapPin, AlertCircle, ChevronDown, LocateFixed, Navigation, Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';

type OrderType = 'delivery' | 'pickup' | 'local';
type CheckoutPayKey = 'pix_online' | 'pix_manual' | 'cash' | 'card' | 'card_online';
type ApiPaymentMethod = 'pix' | 'cash' | 'card';
type CardType = 'credit' | 'debit';
type CheckoutStep = 'fulfillment' | 'contact' | 'address_method' | 'gps' | 'manual' | 'payment';
type AddressMode = 'gps' | 'manual' | null;

interface FormState {
  nome: string;
  telefone: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  referencia: string;
  observacoes: string;
  troco: string;
}

const EMPTY_FORM: FormState = {
  nome: '', telefone: '', endereco: '', numero: '', complemento: '',
  bairro: '', referencia: '', observacoes: '', troco: '',
};

const LOCAL_PLACEHOLDER = { nome: 'Cliente na loja', telefone: '00000000000' };

function formatPhone(v: string | null | undefined) {
  const raw = String(v ?? '');
  const n = raw.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { cartItems, subtotal, addItem } = useCart();
  const { isClosed, status: storeStatus } = useStoreStatus(true);

  const [step, setStep] = useState<CheckoutStep>('fulfillment');
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [addressMode, setAddressMode] = useState<AddressMode>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<CheckoutPayKey>('pix_online');
  const [cardType, setCardType] = useState<CardType>('credit');
  const [needsChange, setNeedsChange] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeMessage, setFeeMessage] = useState('');
  const [feeFound, setFeeFound] = useState<boolean | null>(null);
  const [streetPendingMessage, setStreetPendingMessage] = useState('');
  const [streetNotes, setStreetNotes] = useState('');
  const [streetEtaMinutes, setStreetEtaMinutes] = useState<number | null>(null);
  const [streetBlocked, setStreetBlocked] = useState(false);
  const [canRequestArea, setCanRequestArea] = useState(false);
  const [areaRequestStatus, setAreaRequestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [areaRequestMessage, setAreaRequestMessage] = useState('');
  const feeDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const streetDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [kmConfig, setKmConfig] = useState<KmDeliveryConfig | null>(null);
  const kmEnabled = !!kmConfig?.enabled;
  const areasEnabled = !!kmConfig?.areasEnabled;
  const needsCoordsFee = kmEnabled || areasEnabled;
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [locationLabel, setLocationLabel] = useState('');

  const [paySettings, setPaySettings] = useState<PaymentSettingsPublic | null>(null);

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<ValidateCouponResult | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [fidelityRedeem, setFidelityRedeem] = useState<FidelityRedeemSelection | null>(null);
  const [useCashback, setUseCashback] = useState(false);
  const [cashbackAmount, setCashbackAmount] = useState(0);

  const isDelivery = orderType === 'delivery';
  const usingKm = isDelivery && needsCoordsFee && customerCoords !== null;
  const couponDiscount = appliedCoupon?.discountAmount ?? 0;
  const fidelityDiscount = fidelityRedeem
    ? Math.min(subtotal, Number(fidelityRedeem.product.price) || 0)
    : 0;
  const discount = Math.min(subtotal, couponDiscount + fidelityDiscount);
  const DELIVERY_FEE_UNAVAILABLE =
    'Ainda não conseguimos calcular a taxa de entrega para este endereço. Verifique o endereço ou fale conosco.';
  /** Delivery may only checkout when a fee was successfully resolved (R$ 0 is OK if configured). */
  const hasValidDeliveryFee = !isDelivery || feeFound === true;
  const payableBeforeCashback = Math.max(0, subtotal + (isDelivery && feeFound === true ? deliveryFee : 0) - discount);
  const total = Math.max(0, payableBeforeCashback - (useCashback ? cashbackAmount : 0));
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const cashBlockedForDelivery = isDelivery && paySettings !== null && !paySettings.cashOnDeliveryEnabled;
  const clubePhoneForRedeem = form.telefone || getSavedClubePhone();

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'nome' || key === 'telefone') {
        setPresenceIdentity(
          key === 'nome' ? String(value) : next.nome,
          key === 'telefone' ? String(value) : next.telefone,
        );
        try {
          window.dispatchEvent(new CustomEvent('bgn:presence-identity'));
        } catch { /* ignore */ }
      }
      return next;
    });
    setFieldError('');
  }, []);

  useEffect(() => {
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
    getDeliveryZones().then(list => setZones(Array.isArray(list) ? list : [])).catch(() => setZones([]));
    getKmDeliveryConfig().then(setKmConfig).catch(() => setKmConfig(null));
    getPaymentSettings().then(setPaySettings).catch(() => {});
  }, []);

  const pixOnlineAvailable = !!paySettings?.pixOnlineAvailable;
  const pixManualAvailable = paySettings !== null
    && paySettings.pixManualEnabled !== false
    && !!paySettings.pixConfigured;
  const cardOnlineAvailable = !!paySettings?.cardOnlineEnabled;

  useEffect(() => {
    if (!paySettings) return;
    const cashOk = !(orderType === 'delivery' && !paySettings.cashOnDeliveryEnabled);
    const available: CheckoutPayKey[] = [];
    if (pixOnlineAvailable) available.push('pix_online');
    if (cardOnlineAvailable) available.push('card_online');
    if (cashOk) available.push('cash');
    available.push('card');
    if (pixManualAvailable) available.push('pix_manual');
    if (!available.includes(paymentMethod)) {
      setPaymentMethod(available[0] ?? 'card');
    }
  }, [orderType, paymentMethod, paySettings, pixOnlineAvailable, pixManualAvailable, cardOnlineAvailable]);

  useEffect(() => {
    if (cartItems.length === 0 && !submitting) setLocation('/cardapio');
  }, [cartItems.length, submitting, setLocation]);

  const applyCoordinates = useCallback((lat: number, lng: number) => {
    try {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setCustomerCoords({ lat, lng });
      setGpsError('');

      // Áreas de Entrega take priority when enabled
      if (kmConfig?.areasEnabled) {
        setFeeLoading(true);
        void resolveDeliveryArea(lat, lng)
          .then((result) => {
            if (result.status === "allowed" && result.fee != null) {
              setDeliveryFee(result.fee);
              setFeeFound(true);
              setFeeMessage(
                result.area?.name
                  ? `Área: ${result.area.name}`
                  : "",
              );
              if (result.distanceKm != null) setDistanceKm(result.distanceKm);
              return;
            }
            if (result.status === "blocked") {
              setDeliveryFee(0);
              setFeeFound(false);
              setFeeMessage(result.message || "Não entregamos nesta área.");
              return;
            }
            if (result.status === "outside") {
              setDeliveryFee(0);
              setFeeFound(false);
              setFeeMessage(result.message || "Não entregamos nesta região.");
              return;
            }
            // areasEnabled false unexpectedly — fall through below not possible in then
            setFeeFound(false);
            setFeeMessage("Não foi possível verificar a área de entrega.");
          })
          .catch(() => {
            setFeeFound(false);
            setFeeMessage("Não foi possível verificar a área de entrega.");
          })
          .finally(() => setFeeLoading(false));
        return;
      }

      if (!kmConfig?.enabled) {
        // Neighborhood fee is resolved after reverse-geocode fills `bairro`.
        return;
      }

      const baseLat = parseFloat(String(kmConfig.baseLat ?? '0'));
      const baseLng = parseFloat(String(kmConfig.baseLng ?? '0'));
      if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng) || (baseLat === 0 && baseLng === 0)) {
        setFeeFound(false);
        setFeeMessage('Local da loja não configurado para cálculo por KM. Consulte a taxa com a loja.');
        return;
      }

      const dist = haversineKm(baseLat, baseLng, lat, lng);
      if (!Number.isFinite(dist)) {
        setFeeFound(false);
        setFeeMessage('Não foi possível calcular a distância. Consulte a taxa com a loja.');
        return;
      }

      setDistanceKm(dist);
      const maxDist = parseFloat(String(kmConfig.maxDistanceKm ?? '0'));
      if (Number.isFinite(maxDist) && maxDist > 0 && dist > maxDist) {
        setDeliveryFee(0);
        setFeeFound(false);
        setFeeMessage(`Distância de ${dist.toFixed(1)}km excede o raio de entrega (${maxDist}km). Consulte a taxa com a loja.`);
        return;
      }

      const { fee, consult } = findKmTier(dist, kmConfig.tiers);
      if (!consult && fee !== null && Number.isFinite(fee)) {
        setDeliveryFee(fee);
        setFeeFound(true);
        setFeeMessage('');
      } else {
        setDeliveryFee(0);
        setFeeFound(false);
        setFeeMessage('Distância fora das faixas cadastradas. Consulte a taxa com a loja.');
      }
    } catch (err) {
      console.error('[BurgerGN] applyCoordinates failed:', err);
      setFeeFound(false);
      setFeeMessage('Não foi possível calcular a taxa de entrega. Consulte a taxa com a loja.');
    }
  }, [kmConfig]);

  // Neighborhood fee when KM coords are not driving the fee
  useEffect(() => {
    if (step !== 'manual' && step !== 'payment') return;
    if (!isDelivery || customerCoords || !form.bairro?.trim() || form.bairro === '__outro__') {
      if (!customerCoords && step === 'manual') {
        setDeliveryFee(0);
        setFeeMessage('');
        setFeeFound(null);
      }
      return;
    }
    if (needsCoordsFee) return;

    clearTimeout(feeDebounce.current);
    feeDebounce.current = setTimeout(async () => {
      setFeeLoading(true);
      try {
        const result = await getDeliveryFee(form.bairro.trim());
        if (result.found && result.fee !== null) {
          setDeliveryFee(result.fee);
          setFeeMessage('');
          setFeeFound(true);
        } else {
          setDeliveryFee(0);
          setFeeMessage(result.message ?? 'Consulte a taxa de entrega com a loja.');
          setFeeFound(false);
        }
      } catch {
        setFeeFound(null);
      } finally {
        setFeeLoading(false);
      }
    }, 400);
    return () => clearTimeout(feeDebounce.current);
  }, [form.bairro, isDelivery, customerCoords, needsCoordsFee, step]);

  // Geocode manual address once fields are complete (KM / áreas mode)
  useEffect(() => {
    if (step !== 'manual' || !needsCoordsFee || !isDelivery) return;
    if (!form.endereco?.trim() || !form.numero?.trim() || !form.bairro?.trim() || form.bairro === '__outro__') return;

    clearTimeout(feeDebounce.current);
    feeDebounce.current = setTimeout(async () => {
      setFeeLoading(true);
      try {
        const fullAddr = `${form.endereco}, ${form.numero}, ${form.bairro}, Lauro de Freitas, Bahia, Brasil`;
        const coords = await geocodeAddress(fullAddr);
        if (coords) applyCoordinates(coords.lat, coords.lng);
        else {
          setCustomerCoords(null);
          setDistanceKm(null);
          setFeeFound(false);
          setFeeMessage('Não foi possível localizar este endereço automaticamente. Consulte a taxa com a loja.');
        }
      } catch (err) {
        console.error('[BurgerGN] geocode effect failed:', err);
        setFeeFound(false);
        setFeeMessage('Não foi possível localizar este endereço automaticamente. Consulte a taxa com a loja.');
      } finally {
        setFeeLoading(false);
      }
    }, 900);
    return () => clearTimeout(feeDebounce.current);
  }, [form.endereco, form.numero, form.bairro, needsCoordsFee, isDelivery, step, applyCoordinates]);

  // Street registry check (learning module) — reuses lat/lng already calculated.
  useEffect(() => {
    if (!isDelivery) return;
    if (step !== 'manual' && step !== 'payment' && step !== 'gps') return;
    if (!form.endereco?.trim() || !form.numero?.trim() || !form.bairro?.trim() || form.bairro === '__outro__') {
      setStreetPendingMessage('');
      setStreetNotes('');
      setStreetEtaMinutes(null);
      setStreetBlocked(false);
      setCanRequestArea(false);
      return;
    }

    clearTimeout(streetDebounce.current);
    streetDebounce.current = setTimeout(async () => {
      try {
        const result = await checkDeliveryStreet({
          streetName: form.endereco.trim(),
          addressNumber: form.numero.trim(),
          neighborhood: form.bairro.trim(),
          city: 'Lauro de Freitas',
          lat: customerCoords?.lat,
          lng: customerCoords?.lng,
          customerName: form.nome.trim() || undefined,
          phone: form.telefone || undefined,
          distanceKm: distanceKm ?? undefined,
        });

        const notesText = String(result.notes || result.street?.notes || '').trim();
        setStreetNotes(notesText);

        // Inactive registered street: do not accept delivery there.
        if (result.known && result.active === false) {
          setFeeFound(false);
          setDeliveryFee(0);
          setFeeMessage('');
          setStreetBlocked(true);
          setCanRequestArea(false);
          setStreetPendingMessage(
            result.message ||
              '🔴 Esta rua está temporariamente fora da área de entrega. Escolha outro endereço ou retire na loja.',
          );
          setStreetEtaMinutes(result.etaMinutes ?? null);
          return;
        }

        setStreetBlocked(false);

        if (result.known && result.fee != null && Number.isFinite(result.fee)) {
          setDeliveryFee(result.fee);
          setFeeFound(true);
          setFeeMessage('');
          setStreetPendingMessage('');
          setCanRequestArea(false);
          setStreetEtaMinutes(result.etaMinutes ?? null);
          if (result.distanceKm != null) setDistanceKm(result.distanceKm);
          return;
        }

        if (result.canRequest || result.pending) {
          setCanRequestArea(true);
          setStreetPendingMessage('');
          setStreetEtaMinutes(result.etaMinutes ?? null);
          setFeeFound(false);
        } else {
          setCanRequestArea(false);
          setStreetPendingMessage('');
        }
      } catch {
        /* never block checkout core on street-check failure */
      }
    }, 700);

    return () => clearTimeout(streetDebounce.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.endereco, form.numero, form.bairro, form.nome, form.telefone, customerCoords, distanceKm, isDelivery, step]);

  const resetDeliveryState = () => {
    setCustomerCoords(null);
    setDistanceKm(null);
    setDeliveryFee(0);
    setFeeFound(null);
    setFeeMessage('');
    setStreetPendingMessage('');
    setStreetNotes('');
    setStreetEtaMinutes(null);
    setStreetBlocked(false);
    setCanRequestArea(false);
    setAreaRequestStatus('idle');
    setAreaRequestMessage('');
    setGpsError('');
    setLocationLabel('');
    setAddressMode(null);
    setForm(prev => ({
      ...prev,
      endereco: '', numero: '', complemento: '', bairro: '', referencia: '',
    }));
  };

  const sendAreaAnalysis = async () => {
    const phone = form.telefone.replace(/\D/g, '');
    if (!form.nome.trim() || phone.length < 10) {
      setAreaRequestStatus('error');
      setAreaRequestMessage('Informe nome e telefone antes de solicitar a análise.');
      return;
    }
    if (!form.endereco.trim() || !form.numero.trim() || !form.bairro.trim() || form.bairro === '__outro__') {
      setAreaRequestStatus('error');
      setAreaRequestMessage('Informe rua, número e bairro para solicitar a análise.');
      return;
    }
    setAreaRequestStatus('sending');
    setAreaRequestMessage('');
    try {
      const result = await requestDeliveryAreaAnalysis({
        streetName: form.endereco.trim(),
        addressNumber: form.numero.trim(),
        neighborhood: form.bairro.trim(),
        city: 'Lauro de Freitas',
        lat: customerCoords?.lat,
        lng: customerCoords?.lng,
        customerName: form.nome.trim(),
        phone,
        distanceKm: distanceKm ?? undefined,
      });
      setAreaRequestStatus('sent');
      setAreaRequestMessage(result.message || 'Solicitação enviada com sucesso.');
      setCanRequestArea(false);
    } catch (err) {
      setAreaRequestStatus('error');
      setAreaRequestMessage(err instanceof Error ? err.message : 'Não foi possível enviar a solicitação.');
    }
  };

  const showAreaRequestPanel =
    isDelivery
    && !streetBlocked
    && feeFound === false
    && !!form.endereco.trim()
    && !!form.numero.trim()
    && !!form.bairro.trim()
    && form.bairro !== '__outro__';

  const streetNotesBanner =
    streetNotes.trim().length > 0 ? (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-100 text-sm leading-relaxed">
        <p className="font-bold text-amber-300 mb-1.5">⚠️ Informações importantes para esta região:</p>
        <div className="whitespace-pre-line text-amber-100/95">{streetNotes}</div>
      </div>
    ) : null;

  const goBack = () => {
    setFieldError('');
    setSubmitError('');
    if (step === 'fulfillment') {
      setLocation('/carrinho');
      return;
    }
    if (step === 'contact') {
      setStep('fulfillment');
      return;
    }
    if (step === 'address_method') {
      setStep('contact');
      return;
    }
    if (step === 'gps' || step === 'manual') {
      resetDeliveryState();
      setStep('address_method');
      return;
    }
    if (step === 'payment') {
      if (orderType === 'local') setStep('fulfillment');
      else if (orderType === 'pickup') setStep('contact');
      else if (addressMode === 'gps') setStep('gps');
      else if (addressMode === 'manual') setStep('manual');
      else setStep('address_method');
    }
  };

  const selectOrderType = (type: OrderType) => {
    setOrderType(type);
    setFieldError('');
    resetDeliveryState();
    if (type === 'local') {
      setForm(prev => ({ ...prev, nome: LOCAL_PLACEHOLDER.nome, telefone: LOCAL_PLACEHOLDER.telefone }));
      setStep('payment');
      return;
    }
    setForm(prev => ({
      ...prev,
      nome: prev.nome === LOCAL_PLACEHOLDER.nome ? '' : prev.nome,
      telefone: prev.telefone === LOCAL_PLACEHOLDER.telefone ? '' : prev.telefone,
    }));
    setStep('contact');
  };

  const continueFromContact = () => {
    const nome = form.nome.trim();
    const phoneDigits = form.telefone.replace(/\D/g, '');
    if (!nome) { setFieldError('Informe seu nome.'); return; }
    if (phoneDigits.length < 10) { setFieldError('Informe um telefone válido com DDD.'); return; }
    setFieldError('');
    if (orderType === 'pickup') setStep('payment');
    else setStep('address_method');
  };

  const resolveNeighborhoodFee = async (bairro: string) => {
    if (!bairro?.trim() || bairro === '__outro__' || bairro === 'GPS') return;
    try {
      setFeeLoading(true);
      const result = await getDeliveryFee(bairro.trim());
      if (result.found && result.fee !== null) {
        setDeliveryFee(result.fee);
        setFeeMessage('');
        setFeeFound(true);
      } else {
        setDeliveryFee(0);
        setFeeMessage(result.message ?? 'Consulte a taxa de entrega com a loja.');
        setFeeFound(false);
      }
    } catch {
      setFeeFound(null);
    } finally {
      setFeeLoading(false);
    }
  };

  const startGps = () => {
    setAddressMode('gps');
    setStep('gps');
    if (!navigator.geolocation) {
      setGpsError('Seu navegador não suporta localização.');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        applyCoordinates(lat, lng);
        try {
          const resolved = await reverseGeocode(lat, lng);
          if (resolved) {
            setLocationLabel(resolved.displayName);
            const nextBairro = resolved.bairro || 'GPS';
            setForm(prev => ({
              ...prev,
              endereco: resolved.endereco || prev.endereco || 'Localização GPS',
              numero: resolved.numero || prev.numero || 'S/N',
              bairro: nextBairro,
            }));
            if (!kmConfig?.enabled) await resolveNeighborhoodFee(nextBairro);
          } else {
            setLocationLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
            setForm(prev => ({
              ...prev,
              endereco: prev.endereco || 'Localização GPS',
              numero: prev.numero || 'S/N',
              bairro: prev.bairro || 'GPS',
            }));
            if (!kmConfig?.enabled) {
              setFeeFound(false);
              setFeeMessage('Não foi possível identificar o bairro. Digite o endereço ou Consulte a taxa com a loja.');
            }
          }
        } catch {
          setLocationLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
          setForm(prev => ({
            ...prev,
            endereco: prev.endereco || 'Localização GPS',
            numero: prev.numero || 'S/N',
            bairro: prev.bairro || 'GPS',
          }));
        } finally {
          setGpsLoading(false);
        }
      },
      () => {
        setGpsError('Não foi possível obter sua localização. Tente digitar o endereço.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const confirmGpsLocation = () => {
    if (!customerCoords) {
      setGpsError('Aguarde a localização ou tente novamente.');
      return;
    }
    if (feeFound !== true) {
      setGpsError(DELIVERY_FEE_UNAVAILABLE);
      return;
    }
    setFieldError('');
    setStep('payment');
  };

  const continueFromManual = () => {
    if (!form.endereco.trim()) { setFieldError('Informe a rua.'); return; }
    if (!form.numero.trim()) { setFieldError('Informe o número.'); return; }
    if (!form.bairro.trim() || form.bairro === '__outro__') {
      setFieldError(form.bairro === '__outro__'
        ? DELIVERY_FEE_UNAVAILABLE
        : 'Informe o bairro.');
      return;
    }
    if (feeFound !== true) {
      setFieldError(DELIVERY_FEE_UNAVAILABLE);
      return;
    }
    setFieldError('');
    setStep('payment');
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const result = await validateCoupon(code, subtotal);
      if (result.valid) { setAppliedCoupon(result); setCouponInput(''); }
      else setCouponError(result.message ?? 'Cupom inválido');
    } catch { setCouponError('Erro ao validar cupom'); }
    finally { setCouponLoading(false); }
  };

  const onConfirmOrder = async () => {
    if (isClosed) {
      const detail = storeStatus?.nextOpenLabel && storeStatus.reason !== 'manual_closed'
        ? ` ${storeStatus.nextOpenLabel}`
        : '';
      setSubmitError(`${storeStatus?.message || 'Estamos fechados no momento.'}${detail}`.trim());
      return;
    }
    if (cartItems.length === 0) { setLocation('/cardapio'); return; }
    if (!orderType) { setStep('fulfillment'); return; }

    if (orderType !== 'local') {
      const phoneDigits = form.telefone.replace(/\D/g, '');
      if (!form.nome.trim() || phoneDigits.length < 10) {
        setSubmitError('Dados do cliente incompletos. Volte e preencha nome e telefone.');
        return;
      }
    }

    if (orderType === 'delivery') {
      if (!form.endereco.trim() || !form.numero.trim() || !form.bairro.trim()) {
        setSubmitError('Endereço incompleto. Volte e confirme a localização ou o endereço.');
        return;
      }
      if (feeFound !== true) {
        setSubmitError(DELIVERY_FEE_UNAVAILABLE);
        return;
      }
    }

    if (paymentMethod === 'cash' && needsChange) {
      const troco = parseFloat(form.troco);
      if (!Number.isFinite(troco) || troco <= total) {
        setSubmitError('Informe um valor de troco maior que o total do pedido.');
        return;
      }
    }

    if (fidelityRedeem && !cartItems.some((ci) => ci.item.id === fidelityRedeem.product.id)) {
      setSubmitError('Inclua o hambúrguer gratuito no pedido para resgatar a recompensa do Clube.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const customerName = orderType === 'local' ? (form.nome.trim() || LOCAL_PLACEHOLDER.nome) : form.nome.trim();
      const phone = orderType === 'local' ? (form.telefone.replace(/\D/g, '') || LOCAL_PLACEHOLDER.telefone) : form.telefone;

      const apiPaymentMethod: ApiPaymentMethod =
        paymentMethod === 'pix_online' || paymentMethod === 'pix_manual'
          ? 'pix'
          : paymentMethod === 'card_online'
            ? 'card'
            : paymentMethod;
      const pixMode = paymentMethod === 'pix_online'
        ? 'online' as const
        : paymentMethod === 'pix_manual'
          ? 'manual' as const
          : undefined;

      const result = await createOrder({
        customerName,
        phone,
        address: isDelivery ? form.endereco : '',
        addressNumber: isDelivery ? form.numero : '',
        addressComplement: isDelivery ? form.complemento : '',
        neighborhood: isDelivery ? form.bairro : '',
        reference: isDelivery ? form.referencia : '',
        notes: form.observacoes,
        customerLat: isDelivery && customerCoords ? customerCoords.lat : undefined,
        customerLng: isDelivery && customerCoords ? customerCoords.lng : undefined,
        orderType,
        paymentMethod: apiPaymentMethod,
        pixMode,
        changeFor: paymentMethod === 'cash' && needsChange && form.troco ? parseFloat(form.troco) : undefined,
        cardType: paymentMethod === 'card' || paymentMethod === 'card_online' ? cardType : undefined,
        needsChange: paymentMethod === 'cash' ? needsChange : undefined,
        couponCode: appliedCoupon?.code,
        fidelityRewardId: fidelityRedeem?.rewardId,
        fidelityFreeProductId: fidelityRedeem?.product.id,
        useCashback: useCashback && cashbackAmount > 0,
        items: cartItems.map(ci => ({
          productId: ci.item.id,
          productName: ci.item.name,
          productPrice: ci.item.price,
          quantity: ci.quantity,
          addons: Array.isArray(ci.selectedAddons) ? ci.selectedAddons : [],
          notes: ci.notes,
        })),
      });

      const orderPayload = {
        trackingId: result.trackingId,
        orderNumber: result.orderNumber,
        customerName,
        phone,
        orderType,
        paymentMethod: apiPaymentMethod,
        pixMode: result.pixMode ?? pixMode ?? null,
        cardType: paymentMethod === 'card' || paymentMethod === 'card_online' ? cardType : null,
        needsChange: paymentMethod === 'cash' ? needsChange : false,
        changeFor: paymentMethod === 'cash' && needsChange ? (form.troco || null) : null,
        address: form.endereco ?? '',
        numero: form.numero ?? '',
        complemento: form.complemento ?? '',
        neighborhood: form.bairro ?? '',
        reference: form.referencia ?? '',
        notes: form.observacoes ?? '',
        distanceKm: result.distanceKm ?? null,
        customerLat: isDelivery && customerCoords ? customerCoords.lat : null,
        customerLng: isDelivery && customerCoords ? customerCoords.lng : null,
        couponCode: appliedCoupon?.code ?? null,
        discountAmount: result.discountAmount ?? 0,
        items: cartItems.map(ci => {
          const addons = Array.isArray(ci.selectedAddons) ? ci.selectedAddons : [];
          return {
            name: ci.item.name,
            quantity: ci.quantity,
            price: ci.item.price,
            addons,
            notes: ci.notes ?? '',
            subtotal: (Number(ci.item.price) + addons.reduce((acc, a) => acc + (Number(a.price) || 0), 0)) * ci.quantity,
          };
        }),
        subtotal,
        deliveryFee: result.deliveryFee ?? 0,
        discount,
        total: result.deliveryFee !== undefined
          ? parseFloat((subtotal + result.deliveryFee - (result.discountAmount ?? 0)).toFixed(2))
          : total,
        // Pix QR only when store key is configured — never invent an invalid QR.
        pixPayment: result.pixPayment?.qrCode ? result.pixPayment : null,
        pixConfigured: !!result.pixConfigured && !!result.pixPayment?.qrCode,
        pixUnavailableReason: result.pixUnavailableReason ?? null,
        paymentStatus: result.paymentStatus ?? 'pending',
        workflow: result.workflow ?? (apiPaymentMethod === 'pix' ? 'awaiting_payment' : 'new'),
        createdAt: new Date().toISOString(),
      };

      try {
        sessionStorage.setItem('lastOrder', JSON.stringify(orderPayload));
      } catch (storageErr) {
        console.error('[BurgerGN] sessionStorage lastOrder failed:', storageErr);
      }

      // Persist for "Meu Pedido" across Home / Cardápio / return visits.
      saveMyOrder({
        trackingId: result.trackingId,
        orderNumber: result.orderNumber,
        createdAt: new Date().toISOString(),
      });

      if (result.cardCheckoutUrl) {
        window.location.href = result.cardCheckoutUrl;
        return;
      }
      setLocation('/confirmacao');
    } catch (err) {
      setSubmitError(err instanceof Error && err.message
        ? err.message
        : 'Erro ao enviar pedido. Verifique a conexão e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <PageTransition className="bg-[#0a0a0a]">
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    );
  }

  // Defensive: never render checkout when cart lines are malformed (mobile black-screen root cause).
  const safeCart = Array.isArray(cartItems)
    ? cartItems.filter(ci => ci && ci.item && typeof ci.quantity === 'number')
    : [];
  if (safeCart.length === 0) {
    return (
      <PageTransition className="bg-[#0a0a0a]">
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-zinc-400 text-sm">Não foi possível carregar o carrinho.</p>
          <Button type="button" onClick={() => setLocation('/cardapio')} className="bg-amber-500 text-zinc-950 font-bold">
            Voltar ao cardápio
          </Button>
        </div>
      </PageTransition>
    );
  }

  const stepTitle: Record<CheckoutStep, string> = {
    fulfillment: 'Recebimento',
    contact: 'Seus dados',
    address_method: 'Endereço',
    gps: 'Localização',
    manual: 'Endereço',
    payment: 'Pagamento',
  };

  const feeBanner = (
    <>
    
      {feeLoading ? (
        <div className="space-y-2">
          <Loader2 size={14} className="animate-spin" /> Calculando taxa de entrega...
        </div>
      ) : feeFound === true ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-green-900/20 border border-green-800/40 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 size={16} />
              <span className="text-sm font-bold">
                Taxa de entrega{distanceKm !== null ? ` · ${distanceKm.toFixed(1)} km` : ''}
                {streetEtaMinutes != null ? ` · ~${streetEtaMinutes} min` : ''}
              </span>
            </div>
            <span className="text-green-400 font-black">{fmt(deliveryFee)}</span>
          </div>
          {streetNotesBanner}
          {streetPendingMessage ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm whitespace-pre-line leading-relaxed">
              {streetPendingMessage}
            </div>
          ) : null}
        </div>
      ) : feeFound === false ? (
        <div className="space-y-2">
          {streetPendingMessage ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm whitespace-pre-line leading-relaxed">
              {streetPendingMessage}
            </div>
          ) : showAreaRequestPanel ? null : (
            <div className="flex items-start gap-2 bg-orange-900/20 border border-orange-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="text-orange-400 mt-0.5 shrink-0" />
              <p className="text-orange-400 text-sm">
                {feeMessage || DELIVERY_FEE_UNAVAILABLE}
              </p>
            </div>
          )}
          {streetNotesBanner}
        </div>
      ) : streetPendingMessage || streetNotesBanner ? (
        <div className="space-y-2">
          {streetPendingMessage ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm whitespace-pre-line leading-relaxed">
              {streetPendingMessage}
            </div>
          ) : null}
          {streetNotesBanner}
        </div>
      ) : null}
    
    <div className={showAreaRequestPanel ? 'mt-2' : 'hidden'}>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-3">
        <p className="text-amber-100 text-sm leading-relaxed">
          Esta região ainda não faz parte da nossa área de entrega.
        </p>
        {areaRequestStatus === 'sent' ? (
          <p className="text-emerald-400 text-sm font-bold">{areaRequestMessage || 'Solicitação enviada com sucesso.'}</p>
        ) : (
          <>
            {areaRequestStatus === 'error' && areaRequestMessage ? (
              <p className="text-red-400 text-xs">{areaRequestMessage}</p>
            ) : null}
            <button
              type="button"
              disabled={areaRequestStatus === 'sending'}
              onClick={() => { void sendAreaAnalysis(); }}
              className="w-full h-11 rounded-xl bg-amber-500 text-zinc-950 font-black text-sm uppercase tracking-wide disabled:opacity-50"
            >
              {areaRequestStatus === 'sending' ? 'Enviando…' : '📍 Solicitar análise da minha região'}
            </button>
          </>
        )}
      </div>
    </div>
    </>
  );

  return (
    <ErrorBoundary>
    <PageTransition className="bg-[#0a0a0a]">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <button type="button" onClick={goBack}
            className="p-2 -ml-1 text-zinc-400 hover:text-white transition-colors rounded-xl">
            <ArrowLeft size={24} />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500 font-bold">Checkout</p>
            <h1 className="text-lg font-black text-white uppercase tracking-tight truncate">{stepTitle[step]}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 pb-36 space-y-4">
        <StoreClosedBanner />
        <>
          {/* ── 1. Fulfillment ─────────────────────────────────────────── */}
          {step === 'fulfillment' && (
            <section key="fulfillment"
              className="space-y-5">
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white leading-tight">
                  Como deseja receber seu pedido?
                </h2>
                <p className="text-zinc-500 text-sm">Escolha a opção mais conveniente para você.</p>
              </div>

              <div className="space-y-3">
                {([
                  {
                    key: 'local' as const,
                    icon: <Utensils size={26} />,
                    emoji: '🍽️',
                    title: 'Consumir na loja',
                    desc: 'Peça agora e aproveite no salão. Em breve, identificação pela mesa via QR Code.',
                  },
                  {
                    key: 'pickup' as const,
                    icon: <Store size={26} />,
                    emoji: '🛍️',
                    title: 'Retirar no balcão',
                    desc: 'Seu pedido fica pronto para retirada. Só precisamos do nome e telefone.',
                  },
                  {
                    key: 'delivery' as const,
                    icon: <Bike size={26} />,
                    emoji: '🛵',
                    title: 'Receber em casa',
                    desc: 'Entregamos no seu endereço com taxa calculada automaticamente.',
                  },
                ]).map((opt, i) => (
                  <motion.button
                    key={opt.key}
                    type="button"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                    onClick={() => selectOrderType(opt.key)}
                    className="w-full text-left p-4 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 hover:border-amber-500/60 hover:bg-amber-500/5 transition-all active:scale-[0.99] group"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 transition-colors">
                        {opt.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-black text-base flex items-center gap-2">
                          <span aria-hidden>{opt.emoji}</span> {opt.title}
                        </p>
                        <p className="text-zinc-500 text-sm mt-1 leading-snug">{opt.desc}</p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </section>
          )}

          {/* ── 2. Contact ─────────────────────────────────────────────── */}
          {step === 'contact' && (
            <section key="contact"
              className="space-y-5">
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white leading-tight">Seus dados</h2>
                <p className="text-zinc-500 text-sm">
                  {orderType === 'pickup'
                    ? 'Usamos nome e telefone para chamar quando o pedido estiver pronto.'
                    : 'Usamos nome e telefone para confirmar a entrega.'}
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-sm">Nome *</Label>
                  <Input
                    value={form.nome}
                    onChange={e => setField('nome', e.target.value)}
                    placeholder="Ex: João da Silva"
                    autoComplete="name"
                    className="bg-zinc-900 border-zinc-800 h-12 text-white focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-sm">Telefone (WhatsApp) *</Label>
                  <Input
                    value={form.telefone}
                    onChange={e => setField('telefone', formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    inputMode="tel"
                    autoComplete="tel"
                    className="bg-zinc-900 border-zinc-800 h-12 text-white focus:border-amber-500"
                  />
                </div>
              </div>

              {fieldError && (
                <p className="text-red-400 text-sm flex items-center gap-1.5"><AlertCircle size={14} /> {fieldError}</p>
              )}

              <Button type="button" onClick={continueFromContact} size="lg"
                className="w-full min-h-[52px] font-bold tracking-wider rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950">
                Continuar
              </Button>
            </section>
          )}

          {/* ── 3. Address method ──────────────────────────────────────── */}
          {step === 'address_method' && (
            <section key="address_method"
              className="space-y-5">
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white leading-tight">Onde entregar?</h2>
                <p className="text-zinc-500 text-sm">Use sua localização ou digite o endereço manualmente.</p>
              </div>

              <div className="space-y-3">
                <button type="button" onClick={startGps}
                  className="w-full text-left p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 transition-all active:scale-[0.99]">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center shrink-0">
                      <LocateFixed size={24} />
                    </div>
                    <div>
                      <p className="text-amber-400 font-black text-base">📍 Usar minha localização atual</p>
                      <p className="text-zinc-400 text-sm mt-1">Pedimos permissão do GPS, mostramos o mapa e calculamos a taxa.</p>
                    </div>
                  </div>
                </button>

                <button type="button" onClick={() => { setAddressMode('manual'); setStep('manual'); setCustomerCoords(null); }}
                  className="w-full text-left p-4 rounded-2xl border border-zinc-800 bg-zinc-900 hover:border-amber-500/50 transition-all active:scale-[0.99]">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-zinc-800 text-amber-500 flex items-center justify-center shrink-0">
                      <Home size={24} />
                    </div>
                    <div>
                      <p className="text-white font-black text-base">🏠 Digitar endereço manualmente</p>
                      <p className="text-zinc-500 text-sm mt-1">Rua, número, bairro, complemento e referência.</p>
                    </div>
                  </div>
                </button>
              </div>
            </section>
          )}

          {/* ── 4. GPS confirm ─────────────────────────────────────────── */}
          {step === 'gps' && (
            <section key="gps"
              className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white leading-tight">Confirme sua localização</h2>
                <p className="text-zinc-500 text-sm">Verifique o marcador no mapa e a taxa de entrega antes de continuar.</p>
              </div>

              {/* Stable map host — static <img>, never mount/unmount an iframe */}
              <StreetMapPreview
                lat={customerCoords?.lat ?? null}
                lng={customerCoords?.lng ?? null}
                loading={gpsLoading}
                message={gpsError || 'Aguardando sua localização…'}
              />

              {gpsError && !gpsLoading && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 bg-orange-900/20 border border-orange-800/40 rounded-xl px-4 py-3">
                    <AlertCircle size={16} className="text-orange-400 mt-0.5 shrink-0" />
                    <p className="text-orange-400 text-sm">{gpsError}</p>
                  </div>
                  <Button type="button" onClick={startGps} variant="outline"
                    className="w-full h-12 border-zinc-700 text-white rounded-xl">
                    Tentar novamente
                  </Button>
                  <Button type="button" onClick={() => { setAddressMode('manual'); setStep('manual'); }}
                    className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl">
                    Digitar endereço manualmente
                  </Button>
                </div>
              )}

              {!gpsLoading && customerCoords && (
                <>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 space-y-1">
                    <div className="flex items-center gap-2 text-amber-500 text-xs font-bold uppercase tracking-wider">
                      <MapPin size={14} /> Local detectado
                    </div>
                    <p className="text-zinc-300 text-sm leading-snug">{locationLabel || `${customerCoords.lat.toFixed(5)}, ${customerCoords.lng.toFixed(5)}`}</p>
                    {distanceKm !== null && (
                      <p className="text-zinc-500 text-xs flex items-center gap-1.5">
                        <Navigation size={12} /> Distância aproximada: {distanceKm.toFixed(1)} km
                      </p>
                    )}
                  </div>

                  {feeBanner}

                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Complemento (opcional)</Label>
                    <Input
                      value={form.complemento}
                      onChange={e => setField('complemento', e.target.value)}
                      placeholder="Apto, bloco, casa..."
                      className="bg-zinc-900 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Ponto de referência (opcional)</Label>
                    <Input
                      value={form.referencia}
                      onChange={e => setField('referencia', e.target.value)}
                      placeholder="Ex: Próximo ao mercado"
                      className="bg-zinc-900 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                    />
                  </div>

                  <Button type="button" onClick={confirmGpsLocation} size="lg"
                    className="w-full min-h-[52px] font-bold tracking-wider rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950">
                    Confirmar localização
                  </Button>
                </>
              )}
            </section>
          )}

          {/* ── 5. Manual address ──────────────────────────────────────── */}
          {step === 'manual' && (
            <section key="manual"
              className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white leading-tight">Endereço de entrega</h2>
                <p className="text-zinc-500 text-sm">Preencha os dados para calcularmos a taxa automaticamente.</p>
              </div>

              <div className="space-y-3 bg-zinc-900/80 p-4 rounded-2xl border border-zinc-800">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Rua *</Label>
                    <Input
                      value={form.endereco}
                      onChange={e => setField('endereco', e.target.value)}
                      placeholder="Ex: Rua das Flores"
                      autoComplete="street-address"
                      className="bg-zinc-950 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Número *</Label>
                    <Input
                      value={form.numero}
                      onChange={e => setField('numero', e.target.value)}
                      placeholder="123"
                      className="bg-zinc-950 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Bairro *</Label>
                  {zones.length > 0 && !kmEnabled ? (
                    <div className="relative">
                      <select
                        value={form.bairro}
                        onChange={e => setField('bairro', e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 h-11 text-white text-sm focus:border-amber-500 focus:outline-none appearance-none pr-8"
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
                    <Input
                      value={form.bairro}
                      onChange={e => setField('bairro', e.target.value)}
                      placeholder="Ex: Centro"
                      className="bg-zinc-950 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Complemento</Label>
                  <Input
                    value={form.complemento}
                    onChange={e => setField('complemento', e.target.value)}
                    placeholder="Apto, bloco, casa..."
                    className="bg-zinc-950 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Ponto de referência</Label>
                  <Input
                    value={form.referencia}
                    onChange={e => setField('referencia', e.target.value)}
                    placeholder="Ex: Próximo ao mercado"
                    className="bg-zinc-950 border-zinc-800 h-11 text-white text-sm focus:border-amber-500"
                  />
                </div>

                {feeBanner}
              </div>

              {fieldError && (
                <p className="text-red-400 text-sm flex items-center gap-1.5"><AlertCircle size={14} /> {fieldError}</p>
              )}

              <Button type="button" onClick={continueFromManual} size="lg"
                className="w-full min-h-[52px] font-bold tracking-wider rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950">
                Continuar para pagamento
              </Button>
            </section>
          )}

          {/* ── 6. Payment ─────────────────────────────────────────────── */}
          {step === 'payment' && (
            <section key="payment"
              className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white leading-tight">Forma de pagamento</h2>
                <p className="text-zinc-500 text-sm">
                  {orderType === 'local' && 'Consumo na loja — identificação por QR da mesa em breve.'}
                  {orderType === 'pickup' && `Retirada no balcão · ${form.nome}`}
                  {orderType === 'delivery' && `Entrega · ${form.endereco}, ${form.numero}`}
                </p>
              </div>

              {isDelivery && feeBanner}

              <div className="grid grid-cols-1 gap-2">
                {([
                  pixOnlineAvailable && {
                    key: 'pix_online' as const,
                    icon: <QrCode size={22} />,
                    label: 'PIX Online (Mercado Pago)',
                    hint: 'Pague via PIX do Mercado Pago. Aprovação automática.',
                    blocked: false,
                    principal: true,
                  },
                  cardOnlineAvailable && {
                    key: 'card_online' as const,
                    icon: <CreditCard size={22} />,
                    label: 'Cartão Online (Mercado Pago)',
                    hint: 'Pague com cartão agora, pela internet.',
                    blocked: false,
                    principal: false,
                  },
                  {
                    key: 'cash' as const,
                    icon: <Banknote size={22} />,
                    label: 'Dinheiro',
                    hint: 'Informe se precisa de troco',
                    blocked: cashBlockedForDelivery,
                    principal: false,
                  },
                  {
                    key: 'card' as const,
                    icon: <CreditCard size={22} />,
                    label: 'Cartão na entrega',
                    hint: 'Crédito ou débito no momento do recebimento',
                    blocked: false,
                    principal: false,
                  },
                  pixManualAvailable && {
                    key: 'pix_manual' as const,
                    icon: <QrCode size={22} />,
                    label: pixOnlineAvailable ? 'PIX Manual (Backup)' : 'PIX Manual',
                    hint: pixOnlineAvailable
                      ? 'Use apenas caso o PIX Online esteja indisponível.'
                      : 'Chave PIX da loja. Envie o comprovante após pagar.',
                    blocked: false,
                    principal: false,
                  },
                ] as const).filter((opt): opt is Exclude<typeof opt, false> => Boolean(opt)).map(opt => (
                  <button key={opt.key} type="button" disabled={opt.blocked}
                    onClick={() => setPaymentMethod(opt.key)}
                    className={`p-4 rounded-2xl border flex items-center gap-3.5 text-left transition-all ${
                      opt.blocked
                        ? 'border-zinc-900 bg-zinc-950 text-zinc-700 cursor-not-allowed opacity-50'
                        : paymentMethod === opt.key
                          ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                    }`}>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      paymentMethod === opt.key && !opt.blocked ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-current'
                    }`}>
                      {opt.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm uppercase tracking-wide flex items-center gap-1.5 flex-wrap">
                        {opt.label}
                        {opt.principal && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-500 text-zinc-950 rounded-full px-1.5 py-0.5">
                            <Star size={9} fill="currentColor" /> Principal
                          </span>
                        )}
                      </p>
                      <p className={`text-xs mt-0.5 ${paymentMethod === opt.key && !opt.blocked ? 'text-amber-500/80' : 'text-zinc-500'}`}>
                        {opt.hint}
                      </p>
                    </div>
                    {paymentMethod === opt.key && !opt.blocked && <CheckCircle2 size={18} className="ml-auto shrink-0" />}
                  </button>
                ))}
              </div>

              {cashBlockedForDelivery && (
                <p className="text-zinc-600 text-xs flex items-center gap-1.5">
                  <AlertCircle size={12} /> Dinheiro disponível apenas para retirada ou consumo na loja.
                </p>
              )}

              {paymentMethod === 'pix_online' && (
                <div className="p-4 bg-zinc-900 border border-amber-500/30 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-500">
                    <QrCode size={16} />
                    <p className="text-sm font-bold uppercase tracking-wide">PIX Online</p>
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-500 text-zinc-950 rounded-full px-1.5 py-0.5">
                      <Star size={9} fill="currentColor" /> Principal
                    </span>
                  </div>
                  <p className="text-zinc-300 text-sm">
                    Pague via PIX do Mercado Pago. Aprovação automática.
                  </p>
                  <p className="text-zinc-500 text-xs">
                    Após confirmar, você verá o QR Code dinâmico e o código PIX Copia e Cola. O pedido muda para Pago assim que o Mercado Pago confirmar.
                  </p>
                </div>
              )}

              {paymentMethod === 'pix_manual' && (
                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-500">
                    <QrCode size={16} />
                    <p className="text-sm font-bold uppercase tracking-wide">
                      {pixOnlineAvailable ? 'PIX Manual (Backup)' : 'PIX Manual'}
                    </p>
                  </div>
                  <p className="text-zinc-300 text-sm">
                    {pixOnlineAvailable
                      ? 'Use apenas caso o PIX Online esteja indisponível.'
                      : 'Pague com a chave PIX da loja e envie o comprovante.'}
                  </p>
                  <p className="text-zinc-500 text-xs">
                    Após confirmar, você verá a chave PIX cadastrada e o QR Code estático. O pedido fica aguardando confirmação manual.
                    {paySettings?.pixKeyPreview ? ` Chave: ${paySettings.pixKeyPreview}` : ''}
                  </p>
                </div>
              )}

              {(paymentMethod === 'card' || paymentMethod === 'card_online') && (
                <div className="space-y-3 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
                  <Label className="text-zinc-400 text-sm">Tipo do cartão</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: 'credit' as const, label: 'Crédito' },
                      { key: 'debit' as const, label: 'Débito' },
                    ]).map(opt => (
                      <button key={opt.key} type="button" onClick={() => setCardType(opt.key)}
                        className={`h-11 rounded-xl border text-sm font-bold uppercase tracking-wider transition-all ${
                          cardType === opt.key ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {paymentMethod === 'cash' && (
                <div className="space-y-3 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
                  <Label className="text-zinc-400 text-sm">Precisa de troco?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setNeedsChange(true)}
                      className={`h-11 rounded-xl border text-sm font-bold uppercase tracking-wider transition-all ${
                        needsChange ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                      }`}>
                      Sim
                    </button>
                    <button type="button" onClick={() => { setNeedsChange(false); setField('troco', ''); }}
                      className={`h-11 rounded-xl border text-sm font-bold uppercase tracking-wider transition-all ${
                        !needsChange ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                      }`}>
                      Não
                    </button>
                  </div>
                  {needsChange && (
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-sm">Troco para R$</Label>
                      <Input
                        value={form.troco}
                        onChange={e => setField('troco', e.target.value.replace(/[^\d.,]/g, ''))}
                        placeholder="Ex: 100"
                        inputMode="decimal"
                        className="bg-zinc-950 border-zinc-800 h-12 text-white focus:border-amber-500"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-zinc-400 text-sm">Observações do pedido</Label>
                <textarea
                  value={form.observacoes}
                  onChange={e => setField('observacoes', e.target.value)}
                  placeholder="Ex: Sem cebola, ponto bem passado..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm resize-none focus:border-amber-500 focus:outline-none h-20 placeholder:text-zinc-600"
                />
              </div>

              <div className="space-y-2">
                <ClubeFidelityRedeemPrompt
                  phone={clubePhoneForRedeem}
                  applied={fidelityRedeem}
                  fidelityDiscount={fidelityDiscount}
                  onClear={() => setFidelityRedeem(null)}
                  onRedeem={(selection) => {
                    const already = cartItems.some((ci) => ci.item.id === selection.product.id);
                    if (!already) {
                      addItem(
                        {
                          id: selection.product.id,
                          name: selection.product.name,
                          description: selection.product.description || '',
                          price: parseFloat(selection.product.price) || 0,
                          image: selection.product.image || '',
                          available: selection.product.available,
                        },
                        { notes: 'Hambúrguer grátis — Clube Burger GN', quantity: 1 },
                      );
                    }
                    setFidelityRedeem(selection);
                  }}
                />
              </div>

              <div className="space-y-2">
                <ClubeCashbackCheckoutCard
                  phone={clubePhoneForRedeem}
                  payableBeforeCashback={payableBeforeCashback}
                  useCashback={useCashback}
                  onChange={({ use, amount }) => {
                    setUseCashback(use);
                    setCashbackAmount(amount);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-400 text-sm flex items-center gap-1.5"><Tag size={14} /> Cupom</Label>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-green-900/20 border border-green-800/50 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-green-400 font-black text-sm uppercase">{appliedCoupon.code}</p>
                      <p className="text-green-600 text-xs">-{fmt(appliedCoupon.discountAmount ?? 0)}</p>
                    </div>
                    <button type="button" onClick={() => { setAppliedCoupon(null); setCouponError(''); }}
                      className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors rounded-lg">
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={couponInput}
                      onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleApplyCoupon())}
                      placeholder="CÓDIGO"
                      className="bg-zinc-900 border-zinc-800 h-12 text-white font-mono tracking-wider focus:border-amber-500"
                    />
                    <Button type="button" onClick={handleApplyCoupon} disabled={couponLoading || !couponInput.trim()}
                      className="h-12 px-5 bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-300 font-bold rounded-xl">
                      {couponLoading ? <Loader2 size={16} className="animate-spin" /> : 'Aplicar'}
                    </Button>
                  </div>
                )}
                {couponError && <p className="text-red-400 text-xs">{couponError}</p>}
              </div>

              {submitError && (
                <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm text-center">{submitError}</div>
              )}
            </section>
          )}
        </>
      </main>

      {/* Sticky footer summary — payment step */}
      {step === 'payment' && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-zinc-950/95 border-t border-zinc-800 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-md mx-auto space-y-3">
            <div className="flex justify-between text-sm text-zinc-400">
              <span>
                {safeCart.length} {safeCart.length === 1 ? 'item' : 'itens'}
                {isDelivery && usingKm && distanceKm !== null ? ` · ${distanceKm.toFixed(1)}km` : ''}
              </span>
              <span className="text-amber-500 font-black text-lg">{fmt(total)}</span>
            </div>
            {useCashback && cashbackAmount > 0 && (
              <div className="flex justify-between text-xs text-emerald-400 -mt-1">
                <span>Cashback</span>
                <span>-{fmt(cashbackAmount)}</span>
              </div>
            )}
            {isDelivery && (
              <div className="flex justify-between text-xs text-zinc-500 -mt-1">
                <span>Taxa de entrega</span>
                <span>{feeFound === true ? fmt(deliveryFee) : feeFound === false ? 'Indisponível' : '—'}</span>
              </div>
            )}
            {isDelivery && !hasValidDeliveryFee && !feeLoading && (
              <p className="text-orange-400 text-xs leading-snug">{DELIVERY_FEE_UNAVAILABLE}</p>
            )}
            <Button
              type="button"
              onClick={onConfirmOrder}
              disabled={submitting || !hasValidDeliveryFee || feeLoading || isClosed}
              size="lg"
              className="w-full min-h-[52px] font-bold tracking-wider rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-base disabled:opacity-50 disabled:pointer-events-none">
              {submitting
                ? <><Loader2 size={20} className="animate-spin mr-2" /> Enviando...</>
                : isClosed
                  ? (storeStatus?.message || 'Loja fechada')
                  : 'CONFIRMAR PEDIDO'}
            </Button>
          </div>
        </div>
      )}
    </PageTransition>
    </ErrorBoundary>
  );
}
