import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAdminKmDelivery, updateKmDeliveryConfig, createKmTier, updateKmTier, deleteKmTier,
  KmDeliveryConfig, KmDeliveryTier,
} from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import {
  LayoutDashboard, UtensilsCrossed, Tag, MapPin, Navigation,
  LogOut, Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight,
  Loader2, Locate, AlertCircle, Route, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function AdminNav({ active }: { active: string }) {
  const items = [
    { href: '/admin', icon: <LayoutDashboard size={18} />, label: 'Pedidos' },
    { href: '/admin/cardapio', icon: <UtensilsCrossed size={18} />, label: 'Cardápio' },
    { href: '/admin/cupons', icon: <Tag size={18} />, label: 'Cupons' },
    { href: '/admin/taxas', icon: <MapPin size={18} />, label: 'Bairros' },
    { href: '/admin/entrega-km', icon: <Navigation size={18} />, label: 'Por KM' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
      <div className="max-w-2xl mx-auto flex">
        {items.map(item => (
          <Link key={item.href} href={item.href} className="flex-1">
            <div className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors ${active === item.href ? 'text-amber-500' : 'text-zinc-500 hover:text-white'}`}>
              {item.icon}
              <span className="text-[9px] font-bold uppercase">{item.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </nav>
  );
}

interface TierForm { fromKm: string; toKm: string; fee: string; consult: boolean; }
const emptyTierForm = (): TierForm => ({ fromKm: '', toKm: '', fee: '', consult: false });

export default function KmDelivery() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();

  const [config, setConfig] = useState<KmDeliveryConfig | null>(null);
  const [tiers, setTiers] = useState<KmDeliveryTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configSuccess, setConfigSuccess] = useState(false);

  // Config form
  const [cfEnabled, setCfEnabled] = useState(false);
  const [cfAddress, setCfAddress] = useState('');
  const [cfLat, setCfLat] = useState('');
  const [cfLng, setCfLng] = useState('');
  const [cfMinFee, setCfMinFee] = useState('5.00');
  const [cfFeePerKm, setCfFeePerKm] = useState('2.00');
  const [cfMaxDist, setCfMaxDist] = useState('10.00');

  // Tier form
  const [showTierForm, setShowTierForm] = useState(false);
  const [editTier, setEditTier] = useState<KmDeliveryTier | null>(null);
  const [tierForm, setTierForm] = useState<TierForm>(emptyTierForm());
  const [savingTier, setSavingTier] = useState(false);
  const [tierError, setTierError] = useState('');

  const load = async () => {
    setLoading(true);
    const { config: c, tiers: t } = await getAdminKmDelivery();
    setTiers(t);
    if (c) {
      setConfig(c);
      setCfEnabled(c.enabled);
      setCfAddress(c.baseAddress);
      setCfLat(c.baseLat);
      setCfLng(c.baseLng);
      setCfMinFee(c.minFee);
      setCfFeePerKm(c.feePerKm);
      setCfMaxDist(c.maxDistanceKm);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleGetGPS = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      setCfLat(String(pos.coords.latitude));
      setCfLng(String(pos.coords.longitude));
    }, () => setConfigError('Não foi possível obter localização.'));
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true); setConfigError(''); setConfigSuccess(false);
    try {
      const updated = await updateKmDeliveryConfig({
        enabled: cfEnabled, baseAddress: cfAddress,
        baseLat: cfLat || '0', baseLng: cfLng || '0',
        minFee: cfMinFee, feePerKm: cfFeePerKm, maxDistanceKm: cfMaxDist,
      });
      setConfig({ ...updated, tiers });
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 3000);
    } catch { setConfigError('Erro ao salvar configurações'); }
    finally { setSavingConfig(false); }
  };

  const openEditTier = (t: KmDeliveryTier) => {
    setEditTier(t);
    setTierForm({ fromKm: t.fromKm, toKm: t.toKm ?? '', fee: t.fee ?? '', consult: t.fee === null });
    setShowTierForm(true);
  };

  const handleSaveTier = async () => {
    if (!tierForm.fromKm) { setTierError('Informe o km inicial'); return; }
    setSavingTier(true); setTierError('');
    try {
      const payload = {
        fromKm: tierForm.fromKm,
        toKm: tierForm.toKm || null,
        fee: tierForm.consult ? null : (tierForm.fee || null),
        displayOrder: editTier?.displayOrder ?? tiers.length,
      };
      if (editTier) {
        const updated = await updateKmTier(editTier.id, payload);
        setTiers(prev => prev.map(t => t.id === updated.id ? updated : t));
      } else {
        const created = await createKmTier(payload);
        setTiers(prev => [...prev, created]);
      }
      setShowTierForm(false); setEditTier(null); setTierForm(emptyTierForm());
    } catch { setTierError('Erro ao salvar faixa'); }
    finally { setSavingTier(false); }
  };

  const handleDeleteTier = async (id: number) => {
    if (!confirm('Excluir esta faixa?')) return;
    await deleteKmTier(id);
    setTiers(prev => prev.filter(t => t.id !== id));
  };

  const handleLogout = async () => { await logout(); setLocation('/'); };

  const fmtKm = (v: string | null) => v ? `${parseFloat(v).toFixed(1)} km` : '∞';
  const fmtFee = (t: KmDeliveryTier) => t.fee !== null ? `R$ ${parseFloat(t.fee).toFixed(2).replace('.', ',')}` : 'Consultar WA';

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Navigation size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Entrega por KM</h1>
              <p className="text-zinc-600 text-xs">Taxa baseada em distância • Haversine</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">

          {/* Enable toggle */}
          <div className={`rounded-2xl p-5 border transition-all ${cfEnabled ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white font-black uppercase tracking-wide text-base">Entrega por KM</h2>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {cfEnabled ? 'Ativo — taxa calculada por distância' : 'Inativo — usando taxa por bairro'}
                </p>
              </div>
              <button onClick={() => setCfEnabled(!cfEnabled)}
                className={`transition-colors ${cfEnabled ? 'text-amber-500' : 'text-zinc-600'}`}>
                {cfEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
              </button>
            </div>
          </div>

          {/* Future Google Maps note */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-3">
            <Info size={16} className="text-zinc-500 mt-0.5 shrink-0" />
            <p className="text-zinc-500 text-xs leading-relaxed">
              <span className="text-zinc-400 font-bold">Pronto para Google Maps:</span> O sistema usa a fórmula Haversine para calcular distâncias em linha reta. Para integrar Google Maps Distance Matrix ou Mapbox, basta substituir a função <code className="bg-zinc-800 px-1 rounded text-amber-400 text-[10px]">calculateKmFee(lat, lng)</code> no checkout com a resposta da API de mapas.
            </p>
          </div>

          {/* Restaurant location */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-white font-bold uppercase text-sm flex items-center gap-2">
              <Locate size={16} className="text-amber-500" /> Localização da Hamburgueria
            </h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Endereço (para exibição)</Label>
                <Input value={cfAddress} onChange={e => setCfAddress(e.target.value)}
                  placeholder="Ex: Rua das Flores, 100 – Itinga, Lauro de Freitas – BA"
                  className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Latitude</Label>
                  <Input value={cfLat} onChange={e => setCfLat(e.target.value)} placeholder="-12.7000000"
                    className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm font-mono focus:border-amber-500" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Longitude</Label>
                  <Input value={cfLng} onChange={e => setCfLng(e.target.value)} placeholder="-38.3000000"
                    className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm font-mono focus:border-amber-500" />
                </div>
              </div>
              <Button type="button" onClick={handleGetGPS} variant="outline"
                className="w-full h-10 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-xl text-sm flex gap-2">
                <Locate size={16} /> Pegar minha localização atual (GPS do navegador)
              </Button>
              {cfLat && cfLng && cfLat !== '0' && (
                <p className="text-xs text-zinc-600 text-center">📍 {parseFloat(cfLat).toFixed(6)}, {parseFloat(cfLng).toFixed(6)}</p>
              )}
            </div>
          </section>

          {/* Delivery settings */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-white font-bold uppercase text-sm flex items-center gap-2">
              <Route size={16} className="text-amber-500" /> Configurações de Entrega
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Taxa mínima (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">R$</span>
                  <Input type="number" min="0" step="0.50" value={cfMinFee} onChange={e => setCfMinFee(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm pl-8 focus:border-amber-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">R$ por km</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">R$</span>
                  <Input type="number" min="0" step="0.50" value={cfFeePerKm} onChange={e => setCfFeePerKm(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm pl-8 focus:border-amber-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Máx. distância</Label>
                <div className="relative">
                  <Input type="number" min="1" step="1" value={cfMaxDist} onChange={e => setCfMaxDist(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm pr-8 focus:border-amber-500" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">km</span>
                </div>
              </div>
            </div>
          </section>

          {configError && <p className="text-red-400 text-sm px-1">{configError}</p>}
          {configSuccess && <p className="text-green-400 text-sm px-1 flex items-center gap-2"><Check size={16} /> Configurações salvas!</p>}

          <Button onClick={handleSaveConfig} disabled={savingConfig}
            className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
            {savingConfig ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Salvar Configurações
          </Button>

          {/* Tiers */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold uppercase text-sm flex items-center gap-2">
                <Navigation size={16} className="text-amber-500" /> Faixas de Preço por Distância
              </h3>
            </div>

            {showTierForm && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900 border border-amber-500/30 rounded-xl p-4 space-y-3">
                <h4 className="text-white font-bold text-sm">{editTier ? 'Editar Faixa' : 'Nova Faixa'}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">De (km)</Label>
                    <Input type="number" min="0" step="0.1" value={tierForm.fromKm}
                      onChange={e => setTierForm(f => ({ ...f, fromKm: e.target.value }))}
                      placeholder="0" className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Até (km) — vazio = acima</Label>
                    <Input type="number" min="0" step="0.1" value={tierForm.toKm}
                      onChange={e => setTierForm(f => ({ ...f, toKm: e.target.value }))}
                      placeholder="Acima" className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setTierForm(f => ({ ...f, consult: !f.consult }))}
                    className={`transition-colors ${tierForm.consult ? 'text-orange-400' : 'text-zinc-600'}`}>
                    {tierForm.consult ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                  </button>
                  <span className={`text-sm font-bold ${tierForm.consult ? 'text-orange-400' : 'text-zinc-500'}`}>
                    {tierForm.consult ? 'Consultar pelo WhatsApp' : 'Taxa fixa'}
                  </span>
                </div>
                {!tierForm.consult && (
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Taxa de entrega (R$)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">R$</span>
                      <Input type="number" min="0" step="0.50" value={tierForm.fee}
                        onChange={e => setTierForm(f => ({ ...f, fee: e.target.value }))}
                        placeholder="0,00" className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm pl-9 focus:border-amber-500" />
                    </div>
                  </div>
                )}
                {tierError && <p className="text-red-400 text-xs">{tierError}</p>}
                <div className="flex gap-2">
                  <Button onClick={handleSaveTier} disabled={savingTier}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl h-9 text-sm flex gap-1.5">
                    {savingTier ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
                  </Button>
                  <Button variant="outline" onClick={() => { setShowTierForm(false); setEditTier(null); setTierForm(emptyTierForm()); }}
                    className="flex-1 border-zinc-700 text-zinc-400 hover:bg-zinc-800 rounded-xl h-9 text-sm flex gap-1.5">
                    <X size={14} /> Cancelar
                  </Button>
                </div>
              </motion.div>
            )}

            <div className="space-y-2">
              <AnimatePresence>
                {[...tiers].sort((a, b) => a.displayOrder - b.displayOrder).map(t => (
                  <motion.div key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Navigation size={16} className="text-amber-500 shrink-0" />
                      <div>
                        <p className="text-white font-bold text-sm">
                          {t.toKm ? `${fmtKm(t.fromKm)} – ${fmtKm(t.toKm)}` : `Acima de ${fmtKm(t.fromKm)}`}
                        </p>
                        <p className={`text-sm font-black ${t.fee !== null ? 'text-amber-500' : 'text-orange-400'}`}>
                          {fmtFee(t)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => openEditTier(t)} className="p-1.5 text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDeleteTier(t.id)} className="p-1.5 text-red-500 bg-red-900/20 hover:bg-red-900/40 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {!showTierForm && (
              <Button onClick={() => { setEditTier(null); setTierForm(emptyTierForm()); setShowTierForm(true); }}
                variant="outline" className="w-full h-10 border-zinc-700 text-zinc-400 hover:bg-zinc-800 rounded-xl text-sm flex gap-2">
                <Plus size={16} /> Adicionar Faixa
              </Button>
            )}
          </section>
        </main>
      )}

      <AdminNav active="/admin/entrega-km" />
    </div>
  );
}
