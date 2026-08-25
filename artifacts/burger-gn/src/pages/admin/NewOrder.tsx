import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ArrowLeft, Loader2, Plus, Minus, Search, Trash2, Check, Copy, ShoppingBag,
} from 'lucide-react';
import { ProductDetailModal } from '../../components/ProductDetailModal';
import {
  Addon, Category, OrderType, PaymentMethod, PixMode, CardType, Product,
  PixPaymentResult, PaymentSettingsPublic, KmDeliveryConfig,
  getCategories, getProducts, getPaymentSettings, getKmDeliveryConfig,
  getPublicClubeMe, createClient, createOrder, trackOrder,
  getDeliveryFee, checkDeliveryStreet, resolveDeliveryArea,
  findKmTier, haversineKm, requestDeliveryAreaAnalysis, geocodeDeliveryAddress,
} from '../../lib/api';
import { AdminTab, AdminTabBar } from '../../components/AdminTabs';

type Step = 'cliente' | 'tipo' | 'produtos' | 'pagamento' | 'pix';

type CartLine = {
  key: string;
  product: Product;
  quantity: number;
  addons: Addon[];
  notes: string;
};

type PayChoice = 'pix_online' | 'pix_manual' | 'cash' | 'card';

const CITY = 'Lauro de Freitas';
const STATE = 'Bahia';

function fmt(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function phoneDigits(v: string) {
  return v.replace(/\D/g, '');
}

function formatPhoneInput(v: string) {
  const n = phoneDigits(v).slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

function lineUnit(line: CartLine) {
  const base = parseFloat(line.product.price) || 0;
  const add = line.addons.reduce((s, a) => s + (Number(a.price) || 0), 0);
  return base + add;
}

function lineTotal(line: CartLine) {
  return lineUnit(line) * line.quantity;
}

async function lookupCepOptional(cepDigits: string): Promise<{
  street: string;
  neighborhood: string;
} | null> {
  if (cepDigits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
    const data = (await res.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (!data || data.erro) return null;
    const city = String(data.localidade || '').toLowerCase();
    if (!city.includes('lauro de freitas')) return null;
    if (String(data.uf || '').toUpperCase() !== 'BA') return null;
    return {
      street: String(data.logradouro || '').trim(),
      neighborhood: String(data.bairro || '').trim(),
    };
  } catch {
    return null;
  }
}

export default function AdminNewOrder() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>('cliente');

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [clientStatus, setClientStatus] = useState<'idle' | 'loading' | 'found' | 'new'>('idle');
  const [clientHint, setClientHint] = useState('');
  const [clubeStamps, setClubeStamps] = useState<number | null>(null);
  const [clubeCashback, setClubeCashback] = useState<string | null>(null);

  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [referencia, setReferencia] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [feeFound, setFeeFound] = useState<boolean | null>(null);
  const [feeMessage, setFeeMessage] = useState('');
  const [feeLoading, setFeeLoading] = useState(false);
  const [streetMsg, setStreetMsg] = useState('');
  const [streetBlocked, setStreetBlocked] = useState(false);
  const [canRequestArea, setCanRequestArea] = useState(false);
  const [areaRequestStatus, setAreaRequestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [areaRequestMessage, setAreaRequestMessage] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [catFilter, setCatFilter] = useState<number | 'all'>('all');
  const [productQuery, setProductQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);

  const [paySettings, setPaySettings] = useState<PaymentSettingsPublic | null>(null);
  const [kmConfig, setKmConfig] = useState<KmDeliveryConfig | null>(null);
  const [payChoice, setPayChoice] = useState<PayChoice | null>(null);
  const [cardType, setCardType] = useState<CardType>('credit');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState<{
    trackingId: string;
    orderNumber: number;
    orderId: number;
    pixPayment: PixPaymentResult | null;
    pixMode: PixMode | null;
  } | null>(null);
  const [pixPaid, setPixPaid] = useState(false);
  const [copied, setCopied] = useState(false);

  const feeDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streetDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneLookupDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDelivery = orderType === 'delivery';
  const subtotal = useMemo(() => cart.reduce((s, l) => s + lineTotal(l), 0), [cart]);
  const total = Math.max(0, subtotal + (isDelivery ? deliveryFee : 0));

  const needsCoordsFee = !!(
    kmConfig?.enabled
    && (
      (parseFloat(String(kmConfig.baseLat)) || 0) !== 0
      || (parseFloat(String(kmConfig.baseLng)) || 0) !== 0
    )
  );

  useEffect(() => {
    void getPaymentSettings().then(setPaySettings).catch(() => setPaySettings(null));
    void getKmDeliveryConfig().then(setKmConfig).catch(() => setKmConfig(null));
  }, []);

  useEffect(() => {
    if (step !== 'produtos' || products.length) return;
    setMenuLoading(true);
    Promise.all([getCategories(), getProducts()])
      .then(([cats, prods]) => {
        setCategories(cats.filter((c) => c.active));
        setProducts(prods.filter((p) => p.available));
      })
      .catch(() => {
        setCategories([]);
        setProducts([]);
      })
      .finally(() => setMenuLoading(false));
  }, [step, products.length]);

  const lookupClient = useCallback(async (rawPhone: string) => {
    const digits = phoneDigits(rawPhone);
    if (digits.length < 10) {
      setClientStatus('idle');
      setClientHint('');
      setClubeStamps(null);
      setClubeCashback(null);
      return;
    }
    setClientStatus('loading');
    setClientHint('Consultando Clube GM…');
    try {
      const me = await getPublicClubeMe(digits);
      if (me.found && me.member) {
        setName((prev) => prev.trim() || me.member!.name || '');
        setClientStatus('found');
        setClientHint(`Cliente encontrado no Clube GM: ${me.member.name}`);
        setClubeStamps(me.member.stamps ?? me.fidelity?.stamps ?? null);
        setClubeCashback(me.cashbackProgram?.balance ?? me.member.cashbackBalance ?? null);
      } else {
        setClientStatus('new');
        setClientHint('Cliente novo — será cadastrado no Clube GM ao finalizar o pedido.');
        setClubeStamps(null);
        setClubeCashback(null);
      }
    } catch {
      setClientStatus('new');
      setClientHint('Não foi possível consultar o Clube agora. Você pode seguir e cadastrar no pedido.');
      setClubeStamps(null);
      setClubeCashback(null);
    }
  }, []);

  useEffect(() => {
    if (phoneLookupDebounce.current) clearTimeout(phoneLookupDebounce.current);
    phoneLookupDebounce.current = setTimeout(() => {
      void lookupClient(phone);
    }, 450);
    return () => {
      if (phoneLookupDebounce.current) clearTimeout(phoneLookupDebounce.current);
    };
  }, [phone, lookupClient]);

  const applyCoords = useCallback(async (lat: number, lng: number) => {
    setCoords({ lat, lng });
    setFeeLoading(true);
    try {
      if (kmConfig?.areasEnabled) {
        const area = await resolveDeliveryArea(lat, lng);
        if (area.status === 'blocked') {
          setFeeFound(false);
          setDeliveryFee(0);
          setCanRequestArea(false);
          setFeeMessage(area.message || 'Fora da área de entrega.');
          setDistanceKm(area.distanceKm ?? null);
          return;
        }
        if (area.status === 'allowed' && area.fee != null) {
          setDeliveryFee(area.fee);
          setFeeFound(true);
          setCanRequestArea(false);
          setFeeMessage('');
          setDistanceKm(area.distanceKm ?? null);
          return;
        }
        // outside: approved street check decides eligibility
        setDistanceKm(area.distanceKm ?? null);
        return;
      }
      if (kmConfig?.enabled) {
        const baseLat = parseFloat(String(kmConfig.baseLat));
        const baseLng = parseFloat(String(kmConfig.baseLng));
        if (Number.isFinite(baseLat) && Number.isFinite(baseLng) && (baseLat !== 0 || baseLng !== 0)) {
          const dist = haversineKm(baseLat, baseLng, lat, lng);
          setDistanceKm(parseFloat(dist.toFixed(2)));
          const max = parseFloat(String(kmConfig.maxDistanceKm));
          if (Number.isFinite(max) && dist > max) {
            setFeeFound(false);
            setDeliveryFee(0);
            setFeeMessage('Endereço fora do raio máximo de entrega.');
            return;
          }
          const { fee } = findKmTier(dist, kmConfig.tiers || []);
          if (fee != null && Number.isFinite(fee)) {
            setDeliveryFee(fee);
            setFeeFound(true);
            setFeeMessage('');
            return;
          }
        }
      }
      setFeeFound(null);
      setFeeMessage('Taxa será confirmada pelo servidor ao criar o pedido.');
    } catch {
      setFeeFound(null);
      setFeeMessage('Não foi possível calcular a taxa agora.');
    } finally {
      setFeeLoading(false);
    }
  }, [kmConfig]);

  useEffect(() => {
    if (!isDelivery || step !== 'tipo') return;
    if (!endereco.trim() || !numero.trim() || !bairro.trim()) {
      setFeeFound(null);
      setDeliveryFee(0);
      setFeeMessage('');
      setCoords(null);
      setDistanceKm(null);
      return;
    }

    if (feeDebounce.current) clearTimeout(feeDebounce.current);
    feeDebounce.current = setTimeout(async () => {
      setFeeLoading(true);
      try {
        if (needsCoordsFee) {
          const g = await geocodeDeliveryAddress({
            street: endereco.trim(),
            number: numero.trim(),
            neighborhood: bairro.trim(),
          });
          if (g) await applyCoords(g.lat, g.lng);
          else {
            setCoords(null);
            setFeeMessage('Não foi possível localizar o endereço. Confira rua, número e bairro.');
          }
        } else {
          const result = await getDeliveryFee(bairro.trim());
          if (result.found && result.fee != null) {
            setDeliveryFee(result.fee);
            setFeeFound(true);
            setFeeMessage('');
          } else {
            setDeliveryFee(0);
            setFeeFound(false);
            setFeeMessage(result.message || 'Bairro sem taxa cadastrada.');
          }
        }
      } catch {
        setFeeFound(false);
        setFeeMessage('Erro ao calcular taxa de entrega.');
      } finally {
        setFeeLoading(false);
      }
    }, 700);

    return () => {
      if (feeDebounce.current) clearTimeout(feeDebounce.current);
    };
  }, [endereco, numero, bairro, isDelivery, step, needsCoordsFee, applyCoords]);

  useEffect(() => {
    if (!isDelivery || step !== 'tipo') return;
    if (!endereco.trim() || !numero.trim() || !bairro.trim()) {
      setStreetMsg('');
      setCanRequestArea(false);
      return;
    }
    if (streetDebounce.current) clearTimeout(streetDebounce.current);
    streetDebounce.current = setTimeout(async () => {
      try {
        const result = await checkDeliveryStreet({
          streetName: endereco.trim(),
          addressNumber: numero.trim(),
          neighborhood: bairro.trim(),
          city: CITY,
          cep: phoneDigits(cep) || undefined,
          lat: coords?.lat,
          lng: coords?.lng,
          customerName: name.trim() || undefined,
          phone: phoneDigits(phone) || undefined,
          distanceKm: distanceKm ?? undefined,
        });
        if (result.known && result.active === false) {
          setFeeFound(false);
          setDeliveryFee(0);
          setStreetBlocked(true);
          setCanRequestArea(false);
          setStreetMsg(result.message || 'Rua temporariamente fora da área de entrega.');
          return;
        }
        setStreetBlocked(false);
        if (result.inDeliveryArea && result.fee != null && Number.isFinite(result.fee)) {
          setDeliveryFee(result.fee);
          setFeeFound(true);
          setFeeMessage('');
          setStreetMsg('');
          setCanRequestArea(false);
          if (result.distanceKm != null) setDistanceKm(result.distanceKm);
          return;
        }
        if (result.known && result.fee != null && Number.isFinite(result.fee)) {
          setDeliveryFee(result.fee);
          setFeeFound(true);
          setFeeMessage('');
          setStreetMsg('');
          setCanRequestArea(false);
          if (result.distanceKm != null) setDistanceKm(result.distanceKm);
          return;
        }
        if (result.canRequest || result.pending) {
          setFeeFound(false);
          setStreetMsg('');
          setCanRequestArea(true);
        } else {
          setStreetMsg('');
          setCanRequestArea(false);
        }
      } catch {
        /* non-blocking */
      }
    }, 700);
    return () => {
      if (streetDebounce.current) clearTimeout(streetDebounce.current);
    };
  }, [endereco, numero, bairro, cep, coords, distanceKm, name, phone, isDelivery, step]);

  useEffect(() => {
    if (!created?.trackingId || created.pixMode !== 'online' || pixPaid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const live = await trackOrder(created.trackingId);
        if (!cancelled && live.paymentStatus === 'paid') {
          setPixPaid(true);
        }
      } catch { /* ignore */ }
    };
    const id = setInterval(() => { void tick(); }, 3500);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [created, pixPaid]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== 'all' && p.categoryId !== catFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    });
  }, [products, catFilter, productQuery]);

  const onCepBlur = async () => {
    const digits = phoneDigits(cep);
    if (digits.length !== 8) return;
    const found = await lookupCepOptional(digits);
    if (!found) return;
    if (found.street) setEndereco((prev) => prev.trim() || found.street);
    if (found.neighborhood) setBairro((prev) => prev.trim() || found.neighborhood);
  };

  const addToCart = (product: Product, addons: Addon[], notes: string, quantity: number) => {
    const key = `${product.id}:${addons.map((a) => a.name).sort().join(',')}:${notes}`;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [...prev, { key, product, quantity, addons, notes }];
    });
    setSelectedProduct(null);
  };

  const updateQty = (key: string, delta: number) => {
    setCart((prev) => prev
      .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
      .filter((l) => l.quantity > 0));
  };

  const canLeaveCliente = phoneDigits(phone).length >= 10 && name.trim().length >= 2;
  const canLeaveTipo = !!orderType && (
    !isDelivery
    || (
      endereco.trim().length > 0
      && numero.trim().length > 0
      && bairro.trim().length > 0
      && feeFound !== false
    )
  );
  const canLeaveProdutos = cart.length > 0;

  const pixOnlineOk = !!(paySettings?.pixOnlineAvailable || paySettings?.mercadoPagoReady);
  const pixManualOk = paySettings?.pixManualEnabled !== false;
  const cashOk = orderType === 'delivery'
    ? paySettings?.cashOnDeliveryEnabled !== false
    : true;

  const goNextFromCliente = () => {
    if (!canLeaveCliente) {
      setSubmitError('Informe telefone (WhatsApp) e nome do cliente.');
      return;
    }
    setSubmitError('');
    setStep('tipo');
  };

  const goNextFromTipo = () => {
    if (!orderType) {
      setSubmitError('Selecione o tipo do pedido.');
      return;
    }
    if (isDelivery) {
      if (!endereco.trim() || !numero.trim() || !bairro.trim()) {
        setSubmitError('Para entrega, informe rua, número do imóvel e bairro. CEP e complemento são opcionais.');
        return;
      }
      if (feeFound === false) {
        setSubmitError(feeMessage || streetMsg || 'Entrega indisponível para este endereço.');
        return;
      }
    }
    setSubmitError('');
    setStep('produtos');
  };

  const goNextFromProdutos = () => {
    if (!canLeaveProdutos) {
      setSubmitError('Adicione ao menos um produto.');
      return;
    }
    setSubmitError('');
    if (!payChoice) {
      if (pixOnlineOk) setPayChoice('pix_online');
      else if (pixManualOk) setPayChoice('pix_manual');
    }
    setStep('pagamento');
  };

  const onSubmit = async () => {
    if (!orderType || !payChoice) {
      setSubmitError('Escolha a forma de pagamento.');
      return;
    }
    if (payChoice === 'cash' && needsChange) {
      const troco = parseFloat(changeFor.replace(',', '.'));
      if (!Number.isFinite(troco) || troco <= total) {
        setSubmitError('Informe um valor de troco maior que o total.');
        return;
      }
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const digits = phoneDigits(phone);
      if (clientStatus === 'new' || clientStatus === 'idle') {
        try {
          await createClient({
            name: name.trim(),
            phone: digits,
            origin: 'cadastro_administrativo',
            updateIfExists: true,
          });
        } catch {
          /* order sync also creates; non-blocking */
        }
      }

      const paymentMethod: PaymentMethod =
        payChoice === 'pix_online' || payChoice === 'pix_manual' ? 'pix' : payChoice;
      const pixMode: PixMode | undefined =
        payChoice === 'pix_online' ? 'online' : payChoice === 'pix_manual' ? 'manual' : undefined;

      const result = await createOrder({
        customerName: name.trim(),
        phone: digits,
        address: isDelivery ? endereco.trim() : '',
        addressNumber: isDelivery ? numero.trim() : '',
        addressComplement: isDelivery ? complemento.trim() : '',
        neighborhood: isDelivery ? bairro.trim() : '',
        reference: isDelivery ? referencia.trim() : '',
        notes: orderNotes.trim(),
        customerLat: isDelivery && coords ? coords.lat : undefined,
        customerLng: isDelivery && coords ? coords.lng : undefined,
        orderType,
        paymentMethod,
        pixMode,
        cardType: payChoice === 'card' ? cardType : undefined,
        needsChange: payChoice === 'cash' ? needsChange : undefined,
        changeFor: payChoice === 'cash' && needsChange
          ? parseFloat(changeFor.replace(',', '.'))
          : undefined,
        source: 'attendant',
        items: cart.map((l) => ({
          productId: l.product.id,
          productName: l.product.name,
          productPrice: parseFloat(l.product.price) || 0,
          quantity: l.quantity,
          addons: l.addons,
          notes: l.notes,
        })),
      });

      setCreated({
        trackingId: result.trackingId,
        orderNumber: result.orderNumber,
        orderId: result.orderId,
        pixPayment: result.pixPayment,
        pixMode: result.pixMode ?? pixMode ?? null,
      });

      if (paymentMethod === 'pix' && result.pixPayment?.qrCode) {
        setStep('pix');
        setPixPaid(false);
      } else {
        setLocation('/admin/pedidos');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Falha ao criar pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyPix = async () => {
    const code = created?.pixPayment?.qrCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="admin-shell flex items-center gap-3">
          <Link href="/admin/pedidos" className="p-2 text-zinc-400 hover:text-white">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-white font-black uppercase text-base leading-none">Novo pedido</h1>
            <p className="text-zinc-500 text-xs mt-0.5">Balcão · Telefone · WhatsApp</p>
          </div>
          {cart.length > 0 && step !== 'pix' && (
            <div className="text-right shrink-0">
              <p className="text-amber-500 font-black text-sm">{fmt(total)}</p>
              <p className="text-zinc-600 text-[10px] uppercase">{cart.length} item(ns)</p>
            </div>
          )}
        </div>
        {step !== 'pix' && (
          <div className="admin-shell mt-3">
            <AdminTabBar>
              {([
                ['cliente', '1. Cliente'],
                ['tipo', '2. Tipo'],
                ['produtos', '3. Produtos'],
                ['pagamento', '4. Pagamento'],
              ] as const).map(([id, label]) => (
                <span
                  key={id}
                  role="tab"
                  aria-selected={step === id}
                  className={`admin-tab ${step === id ? 'admin-tab--active' : ''}`}
                >
                  <span className="admin-tab__label">{label}</span>
                </span>
              ))}
            </AdminTabBar>
          </div>
        )}
      </header>

      <main className="admin-shell px-4 py-5 space-y-5">
        {submitError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {submitError}
          </div>
        )}

        {step === 'cliente' && (
          <section className="space-y-4">
            <div>
              <label className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Telefone / WhatsApp</label>
              <input
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                placeholder="(71) 99999-9999"
                className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-white outline-none focus:border-amber-500"
                inputMode="tel"
              />
            </div>
            <div>
              <label className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Nome do cliente</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome completo"
                className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-white outline-none focus:border-amber-500"
              />
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm">
              {clientStatus === 'loading' && (
                <p className="text-zinc-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {clientHint}</p>
              )}
              {clientStatus === 'found' && (
                <div className="space-y-1">
                  <p className="text-emerald-400 flex items-center gap-2"><Check size={14} /> {clientHint}</p>
                  {(clubeStamps != null || clubeCashback != null) && (
                    <p className="text-zinc-500 text-xs">
                      {clubeStamps != null ? `${clubeStamps} selo(s)` : ''}
                      {clubeStamps != null && clubeCashback != null ? ' · ' : ''}
                      {clubeCashback != null ? `Cashback ${fmt(parseFloat(clubeCashback) || 0)}` : ''}
                    </p>
                  )}
                </div>
              )}
              {clientStatus === 'new' && <p className="text-amber-400">{clientHint}</p>}
              {clientStatus === 'idle' && (
                <p className="text-zinc-500">Digite o telefone para buscar no Clube GM e evitar cadastro duplicado.</p>
              )}
            </div>
            <button
              type="button"
              onClick={goNextFromCliente}
              disabled={!canLeaveCliente}
              className="w-full rounded-xl bg-amber-500 text-zinc-950 font-black uppercase py-3 disabled:opacity-40"
            >
              Continuar
            </button>
          </section>
        )}

        {step === 'tipo' && (
          <section className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {([
                ['local', 'Balcão'],
                ['pickup', 'Retirada'],
                ['delivery', 'Entrega'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setOrderType(id);
                    if (id !== 'delivery') {
                      setFeeFound(null);
                      setDeliveryFee(0);
                      setFeeMessage('');
                      setStreetMsg('');
                    }
                  }}
                  className={`rounded-xl border py-4 font-black uppercase text-xs ${
                    orderType === id
                      ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {isDelivery && (
              <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-zinc-400 text-xs">
                  Número do imóvel é obrigatório. CEP e complemento são opcionais.
                </p>
                <div>
                  <label className="text-zinc-500 text-[10px] font-bold uppercase">CEP (opcional)</label>
                  <input
                    value={cep}
                    onChange={(e) => setCep(phoneDigits(e.target.value).slice(0, 8))}
                    onBlur={() => { void onCepBlur(); }}
                    placeholder="00000000"
                    className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 outline-none focus:border-amber-500"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="text-zinc-500 text-[10px] font-bold uppercase">Rua / avenida</label>
                  <input
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 outline-none focus:border-amber-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-zinc-500 text-[10px] font-bold uppercase">Número *</label>
                    <input
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-500 text-[10px] font-bold uppercase">Complemento</label>
                    <input
                      value={complemento}
                      onChange={(e) => setComplemento(e.target.value)}
                      className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-zinc-500 text-[10px] font-bold uppercase">Bairro</label>
                  <input
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-500 text-[10px] font-bold uppercase">Referência</label>
                  <input
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 outline-none focus:border-amber-500"
                  />
                </div>
                <div className="text-sm">
                  {feeLoading && <p className="text-zinc-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Calculando taxa…</p>}
                  {!feeLoading && feeFound === true && (
                    <p className="text-emerald-400">Taxa de entrega: {fmt(deliveryFee)}{distanceKm != null ? ` · ${distanceKm.toFixed(1).replace('.', ',')} km` : ''}</p>
                  )}
                  {!feeLoading && feeMessage && <p className="text-amber-400">{feeMessage}</p>}
                  {!feeLoading && streetMsg && <p className="text-sky-400 whitespace-pre-line">{streetMsg}</p>}
                  {isDelivery && feeFound === false && !streetBlocked && canRequestArea && endereco.trim() && numero.trim() && bairro.trim() && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 space-y-2">
                      <p className="text-amber-100 text-sm">Esta região ainda não faz parte da nossa área de entrega.</p>
                      {areaRequestStatus === 'sent' ? (
                        <p className="text-emerald-400 text-sm font-bold">{areaRequestMessage || 'Solicitação enviada com sucesso.'}</p>
                      ) : (
                        <button
                          type="button"
                          disabled={areaRequestStatus === 'sending'}
                          onClick={async () => {
                            const digits = phoneDigits(phone);
                            if (!name.trim() || digits.length < 10) {
                              setAreaRequestStatus('error');
                              setAreaRequestMessage('Informe nome e telefone do cliente.');
                              return;
                            }
                            setAreaRequestStatus('sending');
                            try {
                              const result = await requestDeliveryAreaAnalysis({
                                streetName: endereco.trim(),
                                addressNumber: numero.trim(),
                                neighborhood: bairro.trim(),
                                city: CITY,
                                cep: phoneDigits(cep) || undefined,
                                lat: coords?.lat,
                                lng: coords?.lng,
                                customerName: name.trim(),
                                phone: digits,
                                distanceKm: distanceKm ?? undefined,
                              });
                              setAreaRequestStatus('sent');
                              setAreaRequestMessage(result.message || 'Solicitação enviada com sucesso.');
                            } catch (err) {
                              setAreaRequestStatus('error');
                              setAreaRequestMessage(err instanceof Error ? err.message : 'Falha ao enviar solicitação.');
                            }
                          }}
                          className="w-full rounded-xl bg-amber-500 text-zinc-950 font-black text-xs uppercase py-2.5 disabled:opacity-50"
                        >
                          {areaRequestStatus === 'sending' ? 'Enviando…' : '📍 Solicitar análise da minha região'}
                        </button>
                      )}
                      {areaRequestStatus === 'error' && areaRequestMessage ? (
                        <p className="text-red-400 text-xs">{areaRequestMessage}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="text-zinc-500 text-[10px] font-bold uppercase">Observações do pedido</label>
              <textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 outline-none focus:border-amber-500"
                placeholder="Ex.: sem cebola, entregar no portão…"
              />
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setStep('cliente')} className="flex-1 rounded-xl border border-zinc-700 py-3 font-bold uppercase text-xs text-zinc-300">
                Voltar
              </button>
              <button
                type="button"
                onClick={goNextFromTipo}
                disabled={!canLeaveTipo}
                className="flex-[2] rounded-xl bg-amber-500 text-zinc-950 font-black uppercase py-3 disabled:opacity-40"
              >
                Continuar
              </button>
            </div>
          </section>
        )}

        {step === 'produtos' && (
          <section className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Buscar produto…"
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2.5 outline-none focus:border-amber-500"
              />
            </div>
            <AdminTabBar>
              <AdminTab active={catFilter === 'all'} onClick={() => setCatFilter('all')}>
                Todos
              </AdminTab>
              {categories.map((c) => (
                <AdminTab key={c.id} active={catFilter === c.id} onClick={() => setCatFilter(c.id)}>
                  {c.name}
                </AdminTab>
              ))}
            </AdminTabBar>

            {menuLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-amber-500" /></div>
            ) : (
              <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProduct(p)}
                    className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3 hover:border-amber-500/50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{p.name}</p>
                      <p className="text-zinc-500 text-xs truncate">{p.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-amber-500 font-black text-sm">{fmt(parseFloat(p.price) || 0)}</p>
                      <Plus size={14} className="ml-auto text-zinc-500" />
                    </div>
                  </button>
                ))}
                {!filteredProducts.length && (
                  <p className="text-zinc-500 text-sm text-center py-6">Nenhum produto encontrado.</p>
                )}
              </div>
            )}

            {cart.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase text-zinc-500 flex items-center gap-1">
                  <ShoppingBag size={12} /> Itens do pedido
                </p>
                {cart.map((l) => (
                  <div key={l.key} className="flex items-start gap-2 border-t border-zinc-800 pt-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{l.product.name}</p>
                      {l.addons.length > 0 && (
                        <p className="text-zinc-500 text-xs truncate">+ {l.addons.map((a) => a.name).join(', ')}</p>
                      )}
                      {l.notes && <p className="text-zinc-500 text-xs italic truncate">{l.notes}</p>}
                      <p className="text-amber-500 text-xs font-bold mt-0.5">{fmt(lineTotal(l))}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => updateQty(l.key, -1)} className="p-1.5 rounded-lg bg-zinc-800"><Minus size={14} /></button>
                      <span className="w-6 text-center text-sm font-bold">{l.quantity}</span>
                      <button type="button" onClick={() => updateQty(l.key, 1)} className="p-1.5 rounded-lg bg-zinc-800"><Plus size={14} /></button>
                      <button type="button" onClick={() => setCart((prev) => prev.filter((x) => x.key !== l.key))} className="p-1.5 text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-2 border-t border-zinc-800">
                  <span className="text-zinc-400">Subtotal</span>
                  <span className="font-black">{fmt(subtotal)}</span>
                </div>
                {isDelivery && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Entrega</span>
                    <span className="font-bold">{fmt(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base">
                  <span className="font-bold">Total</span>
                  <span className="font-black text-amber-500">{fmt(total)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setStep('tipo')} className="flex-1 rounded-xl border border-zinc-700 py-3 font-bold uppercase text-xs text-zinc-300">
                Voltar
              </button>
              <button
                type="button"
                onClick={goNextFromProdutos}
                disabled={!canLeaveProdutos}
                className="flex-[2] rounded-xl bg-amber-500 text-zinc-950 font-black uppercase py-3 disabled:opacity-40"
              >
                Continuar
              </button>
            </div>
          </section>
        )}

        {step === 'pagamento' && (
          <section className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm space-y-1">
              <p><span className="text-zinc-500">Cliente:</span> {name} · {formatPhoneInput(phone)}</p>
              <p>
                <span className="text-zinc-500">Tipo:</span>{' '}
                {orderType === 'local' ? 'Balcão' : orderType === 'pickup' ? 'Retirada' : 'Entrega'}
              </p>
              {isDelivery && (
                <p className="text-zinc-300">
                  {endereco}, {numero}{complemento ? ` — ${complemento}` : ''} · {bairro}
                </p>
              )}
              <p className="font-black text-amber-500 text-lg">{fmt(total)}</p>
            </div>

            <div className="space-y-2">
              {pixOnlineOk && (
                <button
                  type="button"
                  onClick={() => setPayChoice('pix_online')}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${payChoice === 'pix_online' ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`}
                >
                  <p className="font-bold">PIX Online (Mercado Pago)</p>
                  <p className="text-zinc-500 text-xs">QR Code dinâmico · confirmação automática via webhook</p>
                </button>
              )}
              {pixManualOk && (
                <button
                  type="button"
                  onClick={() => setPayChoice('pix_manual')}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${payChoice === 'pix_manual' ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`}
                >
                  <p className="font-bold">PIX Manual</p>
                  <p className="text-zinc-500 text-xs">Chave da loja · aguarda comprovante</p>
                </button>
              )}
              {cashOk && (
                <button
                  type="button"
                  onClick={() => setPayChoice('cash')}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${payChoice === 'cash' ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`}
                >
                  <p className="font-bold">Dinheiro</p>
                </button>
              )}
              <button
                type="button"
                onClick={() => setPayChoice('card')}
                className={`w-full rounded-xl border px-4 py-3 text-left ${payChoice === 'card' ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`}
              >
                <p className="font-bold">Cartão na entrega / balcão</p>
              </button>
            </div>

            {payChoice === 'card' && (
              <div className="flex gap-2">
                {(['credit', 'debit'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCardType(t)}
                    className={`flex-1 rounded-xl border py-2.5 text-xs font-bold uppercase ${cardType === t ? 'border-amber-500 text-amber-400' : 'border-zinc-800 text-zinc-400'}`}
                  >
                    {t === 'credit' ? 'Crédito' : 'Débito'}
                  </button>
                ))}
              </div>
            )}

            {payChoice === 'cash' && (
              <div className="space-y-2 rounded-xl border border-zinc-800 p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={needsChange} onChange={(e) => setNeedsChange(e.target.checked)} />
                  Precisa de troco
                </label>
                {needsChange && (
                  <input
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value)}
                    placeholder="Troco para quanto?"
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 outline-none focus:border-amber-500"
                    inputMode="decimal"
                  />
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setStep('produtos')} className="flex-1 rounded-xl border border-zinc-700 py-3 font-bold uppercase text-xs text-zinc-300">
                Voltar
              </button>
              <button
                type="button"
                onClick={() => { void onSubmit(); }}
                disabled={!payChoice || submitting}
                className="flex-[2] rounded-xl bg-amber-500 text-zinc-950 font-black uppercase py-3 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
                Criar pedido
              </button>
            </div>
          </section>
        )}

        {step === 'pix' && created && (
          <section className="space-y-4 text-center">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-5">
              <p className="text-zinc-500 text-xs uppercase font-bold tracking-wider">Pedido #{created.orderNumber}</p>
              {pixPaid ? (
                <>
                  <p className="text-emerald-400 font-black text-xl mt-2 flex items-center justify-center gap-2">
                    <Check size={22} /> PIX confirmado
                  </p>
                  <p className="text-zinc-400 text-sm mt-2">Pagamento validado pelo provedor. O pedido já está no painel.</p>
                  <button
                    type="button"
                    onClick={() => setLocation('/admin/pedidos')}
                    className="mt-5 w-full rounded-xl bg-amber-500 text-zinc-950 font-black uppercase py-3"
                  >
                    Ir para Pedidos
                  </button>
                </>
              ) : (
                <>
                  <p className="text-amber-400 font-black text-lg mt-2">Aguardando pagamento PIX</p>
                  <p className="text-zinc-500 text-xs mt-1">
                    Confirmação automática via Mercado Pago — não marque como pago manualmente aqui.
                  </p>
                  {created.pixPayment?.qrCodeBase64 ? (
                    <img
                      src={`data:image/png;base64,${created.pixPayment.qrCodeBase64}`}
                      alt="QR Code PIX"
                      className="mx-auto mt-4 w-52 h-52 rounded-xl bg-white p-2"
                    />
                  ) : created.pixPayment?.qrCode ? (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(created.pixPayment.qrCode)}`}
                      alt="QR Code PIX"
                      className="mx-auto mt-4 w-52 h-52 rounded-xl bg-white p-2"
                    />
                  ) : null}
                  {created.pixPayment?.qrCode && (
                    <div className="mt-4 text-left">
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Copia e cola</p>
                      <p className="text-xs break-all bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-300">
                        {created.pixPayment.qrCode}
                      </p>
                      <button
                        type="button"
                        onClick={() => { void copyPix(); }}
                        className="mt-2 w-full rounded-xl border border-zinc-700 py-2.5 text-xs font-bold uppercase flex items-center justify-center gap-2"
                      >
                        <Copy size={14} /> {copied ? 'Copiado!' : 'Copiar código PIX'}
                      </button>
                    </div>
                  )}
                  <div className="mt-5 flex items-center justify-center gap-2 text-zinc-400 text-sm">
                    <Loader2 size={16} className="animate-spin text-amber-500" />
                    Aguardando confirmação do webhook…
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocation('/admin/pedidos')}
                    className="mt-4 w-full rounded-xl border border-zinc-700 py-3 font-bold uppercase text-xs text-zinc-300"
                  >
                    Abrir painel de pedidos
                  </button>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdd={addToCart}
      />
    </div>
  );
}
