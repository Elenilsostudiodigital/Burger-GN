import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAdminPaymentSettings, updatePaymentSettings, PaymentSettingsAdmin,
  getAdminExternalLinks, createExternalLink, updateExternalLink, deleteExternalLink, ExternalLink,
  getAdminWhatsappSettings, updateWhatsappSettings,
} from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import {
  LayoutDashboard, UtensilsCrossed, Tag, MapPin, Navigation, Settings,
  LogOut, Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight,
  Loader2, CreditCard, Link as LinkIcon, ShieldAlert, ShieldCheck, Upload,
  MessageCircle, TrendingUp, Crown, Star, Clock, Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EstablishmentTab } from './EstablishmentTab';
import { StoreBrandMark } from '../../components/StoreBrand';
import { useStore } from '../../context/StoreContext';

function AdminNav({ active }: { active: string }) {
  const items = [
    { href: '/admin', icon: <TrendingUp size={17} />, label: 'Início' },
    { href: '/admin/pedidos', icon: <LayoutDashboard size={17} />, label: 'Pedidos' },
    { href: '/admin/avaliacoes', icon: <Star size={17} />, label: 'Avaliações' },
    { href: '/admin/cardapio', icon: <UtensilsCrossed size={17} />, label: 'Cardápio' },
    { href: '/admin/financeiro', icon: <TrendingUp size={17} />, label: 'Financeiro' },
    { href: '/admin/cupons', icon: <Tag size={17} />, label: 'Cupons' },
    { href: '/admin/clube', icon: <Crown size={17} />, label: 'Clube' },
    { href: '/admin/taxas', icon: <MapPin size={17} />, label: 'Bairros' },
    { href: '/admin/entrega-km', icon: <Navigation size={17} />, label: 'Por KM' },
    { href: '/admin/config', icon: <Settings size={17} />, label: 'Config' },
    { href: '/admin/importar', icon: <Upload size={17} />, label: 'Importar' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
      <div className="max-w-3xl mx-auto flex overflow-x-auto no-scrollbar">
        {items.map(item => (
          <Link key={item.href} href={item.href} className="flex-1 min-w-[64px]">
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

type Tab = 'estabelecimento' | 'pagamento' | 'preparo' | 'links' | 'whatsapp' | 'ruas';

function PrepTimeTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prepTimeMin, setPrepTimeMin] = useState('35');
  const [prepTimeMax, setPrepTimeMax] = useState('45');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const s = await getAdminPaymentSettings();
        setPrepTimeMin(String(s.prepTimeMin ?? 35));
        setPrepTimeMax(String(s.prepTimeMax ?? 45));
      } catch {
        setError('Não foi possível carregar o tempo de preparo');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true); setSuccess(false); setError('');
    try {
      const updated = await updatePaymentSettings({
        prepTimeMin: Number(prepTimeMin) || 35,
        prepTimeMax: Number(prepTimeMax) || 45,
      });
      setPrepTimeMin(String(updated.prepTimeMin ?? 35));
      setPrepTimeMax(String(updated.prepTimeMax ?? 45));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Erro ao salvar tempo de preparo');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-amber-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <div>
          <h3 className="text-white font-black uppercase tracking-wide text-sm">⏱ Tempo de Preparo</h3>
          <p className="text-zinc-500 text-xs mt-1">
            Define o prazo estimado da cozinha. O cronômetro inicia ao aceitar o pedido e usa o tempo máximo.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">Tempo mínimo (minutos)</Label>
            <Input type="number" min={5} max={180} value={prepTimeMin}
              onChange={e => setPrepTimeMin(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">Tempo máximo (minutos)</Label>
            <Input type="number" min={5} max={240} value={prepTimeMax}
              onChange={e => setPrepTimeMax(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
          </div>
        </div>
        <p className="text-zinc-600 text-xs">Padrão: 35 a 45 minutos. Aviso amarelo nos últimos 10 minutos.</p>
      </div>

      {success && <p className="text-green-400 text-sm px-1 flex items-center gap-2"><Check size={16} /> Tempo de preparo salvo!</p>}
      {error && <p className="text-red-400 text-sm px-1 flex items-center gap-2"><X size={16} /> {error}</p>}

      <Button onClick={handleSave} disabled={saving}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Salvar Tempo de Preparo
      </Button>
    </div>
  );
}

function PaymentTab() {
  const [settings, setSettings] = useState<PaymentSettingsAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(false);
  const [cashOnDelivery, setCashOnDelivery] = useState(true);
  const [accessToken, setAccessToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixName, setPixName] = useState('THE BURGER GN');
  const [pixCity, setPixCity] = useState('LAURO DE FREITAS');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const s = await getAdminPaymentSettings();
    setSettings(s);
    setOnline(s.onlinePaymentEnabled);
    setCashOnDelivery(s.cashOnDeliveryEnabled);
    setPublicKey(s.mercadoPagoPublicKey);
    setPixKey(s.pixKey ?? '');
    setPixName(s.pixMerchantName ?? 'THE BURGER GN');
    setPixCity(s.pixMerchantCity ?? 'LAURO DE FREITAS');
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true); setSuccess(false); setError('');
    try {
      const updated = await updatePaymentSettings({
        onlinePaymentEnabled: online,
        cashOnDeliveryEnabled: cashOnDelivery,
        mercadoPagoAccessToken: accessToken.trim() || undefined,
        mercadoPagoPublicKey: publicKey.trim(),
        pixKey,
        pixMerchantName: pixName,
        pixMerchantCity: pixCity,
      });
      setSettings(updated);
      setAccessToken('');
      setPixKey(updated.pixKey ?? pixKey);
      setSaving(false); setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Erro ao salvar configurações');
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Remover as credenciais do Mercado Pago?')) return;
    setSaving(true);
    try {
      const updated = await updatePaymentSettings({ clearMercadoPagoCredentials: true, onlinePaymentEnabled: false });
      setSettings(updated);
      setOnline(false);
      setAccessToken(''); setPublicKey('');
    } finally { setSaving(false); }
  };

  if (loading || !settings) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Static Pix — active now */}
      <div className={`rounded-2xl p-5 border flex items-start gap-3 ${settings.pixConfigured ? 'bg-green-900/10 border-green-800/40' : 'bg-amber-900/10 border-amber-800/40'}`}>
        {settings.pixConfigured
          ? <ShieldCheck size={22} className="text-green-400 mt-0.5 shrink-0" />
          : <ShieldAlert size={22} className="text-amber-400 mt-0.5 shrink-0" />}
        <div>
          <p className={`font-bold text-sm ${settings.pixConfigured ? 'text-green-400' : 'text-amber-400'}`}>
            {settings.pixConfigured ? 'Pix manual ativo' : 'Configure a chave Pix'}
          </p>
          <p className="text-zinc-500 text-xs mt-1 leading-relaxed">
            Gera QR Code e Copia e Cola automaticamente no pedido. Comprovantes enviados pelo cliente aparecem no painel.
          </p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <Label className="text-zinc-400 text-xs uppercase font-bold">Chave Pix (Copia e Cola)</Label>
        <div className="space-y-1.5">
          <Label className="text-zinc-500 text-xs">Chave (e-mail, CPF/CNPJ, telefone ou aleatória)</Label>
          <Input value={pixKey} onChange={e => setPixKey(e.target.value)}
            placeholder="sua-chave-pix@email.com"
            className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500 font-mono" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">Nome no Pix</Label>
            <Input value={pixName} onChange={e => setPixName(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-500 text-xs">Cidade</Label>
            <Input value={pixCity} onChange={e => setPixCity(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
          </div>
        </div>
      </div>

      {/* Mercado Pago — future ready, not active */}
      <div className="rounded-2xl p-5 border border-zinc-800 bg-zinc-900/50 flex items-start gap-3 opacity-80">
        <ShieldAlert size={22} className="text-zinc-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-bold text-sm text-zinc-400">Mercado Pago (preparado — ainda não ativo)</p>
          <p className="text-zinc-600 text-xs mt-1 leading-relaxed">
            Credenciais podem ser salvas agora. A integração automática será ligada em uma etapa futura, sem perder o Pix manual.
          </p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <Label className="text-zinc-400 text-xs uppercase font-bold">Credenciais do Mercado Pago (futuro)</Label>
        <div className="space-y-1.5">
          <Label className="text-zinc-500 text-xs">Access Token {settings.mercadoPagoConfigured && <span className="text-zinc-600">(atual: {settings.mercadoPagoAccessTokenPreview})</span>}</Label>
          <Input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)}
            placeholder={settings.mercadoPagoConfigured ? 'Deixe em branco para manter o token atual' : 'APP_USR-...'}
            className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500 font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-500 text-xs">Public Key</Label>
          <Input value={publicKey} onChange={e => setPublicKey(e.target.value)} placeholder="APP_USR-..."
            className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500 font-mono" />
        </div>
        <p className="text-zinc-600 text-xs leading-relaxed">
          Encontre essas chaves em: Painel do Mercado Pago → Seu negócio → Configurações → Credenciais. As notificações de pagamento (webhook) são configuradas automaticamente, não é preciso cadastrar nada no painel do Mercado Pago.
        </p>
        {settings.mercadoPagoConfigured && (
          <button type="button" onClick={handleDisconnect} disabled={saving}
            className="text-red-400 text-xs font-bold hover:underline">
            Remover credenciais
          </button>
        )}
      </div>

      {/* Online payment toggle */}
      <div className={`rounded-2xl p-5 border transition-all ${online ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-black uppercase tracking-wide text-sm">Pagamento Online (Pix + Cartão)</h3>
            <p className="text-zinc-500 text-xs mt-0.5">
              {settings.mercadoPagoConfigured ? 'Processa Pix e cartão automaticamente via Mercado Pago' : 'Salve as credenciais acima para poder ativar'}
            </p>
          </div>
          <button type="button" disabled={!settings.mercadoPagoConfigured} onClick={() => setOnline(!online)}
            className={`transition-colors ${!settings.mercadoPagoConfigured ? 'text-zinc-700 cursor-not-allowed' : online ? 'text-amber-500' : 'text-zinc-600'}`}>
            {online ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
          </button>
        </div>
      </div>

      {/* Cash on delivery */}
      <div className={`rounded-2xl p-5 border transition-all ${cashOnDelivery ? 'bg-zinc-900 border-zinc-800' : 'bg-orange-900/10 border-orange-800/40'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-black uppercase tracking-wide text-sm flex items-center gap-2">
              <CreditCard size={16} className="text-amber-500" /> Dinheiro na Entrega
            </h3>
            <p className="text-zinc-500 text-xs mt-0.5">
              {cashOnDelivery ? 'Cliente pode pagar em dinheiro no delivery' : 'Dinheiro só disponível para retirada/local'}
            </p>
          </div>
          <button type="button" onClick={() => setCashOnDelivery(!cashOnDelivery)}
            className={`transition-colors ${cashOnDelivery ? 'text-amber-500' : 'text-zinc-600'}`}>
            {cashOnDelivery ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
          </button>
        </div>
      </div>

      {/* Estimated prep time lives in Configurações > Tempo de Preparo */}

      {success && <p className="text-green-400 text-sm px-1 flex items-center gap-2"><Check size={16} /> Configurações salvas!</p>}
      {error && <p className="text-red-400 text-sm px-1 flex items-center gap-2"><X size={16} /> {error}</p>}

      <Button onClick={handleSave} disabled={saving}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Salvar Configurações
      </Button>
    </div>
  );
}

function LinksTab() {
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editLink, setEditLink] = useState<ExternalLink | null>(null);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => { setLoading(true); setLinks(await getAdminExternalLinks()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const openEdit = (l: ExternalLink) => { setEditLink(l); setLabel(l.label); setUrl(l.url); setShowForm(true); };
  const openNew = () => { setEditLink(null); setLabel(''); setUrl(''); setShowForm(true); };

  const handleSave = async () => {
    if (!label.trim() || !url.trim()) { setError('Preencha nome e link'); return; }
    setSaving(true); setError('');
    try {
      if (editLink) {
        const updated = await updateExternalLink(editLink.id, { label, url });
        setLinks(prev => prev.map(l => l.id === updated.id ? updated : l));
      } else {
        const created = await createExternalLink({ label, url, displayOrder: links.length });
        setLinks(prev => [...prev, created]);
      }
      setShowForm(false); setEditLink(null); setLabel(''); setUrl('');
    } catch { setError('Erro ao salvar link'); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (l: ExternalLink) => {
    const updated = await updateExternalLink(l.id, { active: !l.active });
    setLinks(prev => prev.map(x => x.id === updated.id ? updated : x));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este link?')) return;
    await deleteExternalLink(id);
    setLinks(prev => prev.filter(l => l.id !== id));
  };

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-500 text-xs leading-relaxed">
          Cadastre aqui o link do seu cardápio atual (ex: Nota aí) ou outros links externos. Eles aparecerão como botões no final do cardápio digital, como "Ver cardápio completo".
        </p>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-900 border border-amber-500/30 rounded-xl p-4 space-y-3">
          <h4 className="text-white font-bold text-sm">{editLink ? 'Editar Link' : 'Novo Link'}</h4>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Nome do botão</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex: Ver cardápio completo (Nota aí)"
              className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">URL</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
              className="bg-zinc-950 border-zinc-800 text-white h-10 text-sm focus:border-amber-500" />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl h-9 text-sm flex gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}
              className="flex-1 border-zinc-700 text-zinc-400 hover:bg-zinc-800 rounded-xl h-9 text-sm flex gap-1.5">
              <X size={14} /> Cancelar
            </Button>
          </div>
        </motion.div>
      )}

      <div className="space-y-2">
        <AnimatePresence>
          {links.map(l => (
            <motion.div key={l.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <LinkIcon size={16} className="text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-white font-bold text-sm truncate">{l.label}</p>
                  <p className="text-zinc-500 text-xs truncate">{l.url}</p>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => handleToggleActive(l)} className={`transition-colors ${l.active ? 'text-amber-500' : 'text-zinc-600'}`}>
                  {l.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
                <button onClick={() => openEdit(l)} className="p-1.5 text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(l.id)} className="p-1.5 text-red-500 bg-red-900/20 hover:bg-red-900/40 rounded-lg">
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {!showForm && (
        <Button onClick={openNew} variant="outline" className="w-full h-10 border-zinc-700 text-zinc-400 hover:bg-zinc-800 rounded-xl text-sm flex gap-2">
          <Plus size={16} /> Adicionar Link
        </Button>
      )}
    </div>
  );
}

function WhatsappTab() {
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const s = await getAdminWhatsappSettings();
    setNumber(s.number);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true); setSuccess(false); setError('');
    try {
      const updated = await updateWhatsappSettings({ number: number.trim() });
      setNumber(updated.number);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Número inválido. Use apenas dígitos com DDI e DDD (ex: 5571999998888).');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-500 text-xs leading-relaxed">
          Cadastre o número oficial de WhatsApp da loja (estrutura preparada para a API oficial).
          Temporariamente, durante testes, nenhuma mensagem é enviada nem aberta no WhatsApp —
          as notificações acontecem apenas dentro do sistema (Meu Pedido e painel admin).
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <Label className="text-zinc-400 text-xs uppercase font-bold">Número do WhatsApp</Label>
        <div className="space-y-1.5">
          <Input value={number} onChange={e => setNumber(e.target.value)} placeholder="5571999998888"
            className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500 font-mono" />
          <p className="text-zinc-600 text-xs leading-relaxed">
            Apenas números, com código do país e DDD (ex: 55 + 71 + número = 5571999998888). Sem espaços, traços ou parênteses.
          </p>
        </div>
      </div>

      {success && <p className="text-green-400 text-sm px-1 flex items-center gap-2"><Check size={16} /> Número salvo!</p>}
      {error && <p className="text-red-400 text-sm px-1 flex items-center gap-2"><X size={16} /> {error}</p>}

      <Button onClick={handleSave} disabled={saving}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Salvar Número
      </Button>
    </div>
  );
}

export default function SettingsHub() {
  const { logout } = useAdmin();
  const { store, refresh } = useStore();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>('estabelecimento');

  const handleLogout = async () => { await logout(); setLocation('/'); };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StoreBrandMark size={36} />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Configurações</h1>
              <p className="text-zinc-600 text-xs">{store.storeName || 'Estabelecimento, pagamento e links'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button onClick={() => setTab('estabelecimento')}
            className={`shrink-0 flex-1 min-w-[7.5rem] h-11 rounded-xl font-bold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${tab === 'estabelecimento' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
            <Store size={16} /> Estabelecimento
          </button>
          <button onClick={() => setTab('pagamento')}
            className={`shrink-0 flex-1 min-w-[7rem] h-11 rounded-xl font-bold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${tab === 'pagamento' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
            <CreditCard size={16} /> Pagamento
          </button>
          <button onClick={() => setTab('preparo')}
            className={`shrink-0 flex-1 min-w-[7rem] h-11 rounded-xl font-bold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${tab === 'preparo' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
            <Clock size={16} /> Tempo de Preparo
          </button>
          <button onClick={() => setTab('links')}
            className={`shrink-0 flex-1 min-w-[7rem] h-11 rounded-xl font-bold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${tab === 'links' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
            <LinkIcon size={16} /> Links Externos
          </button>
          <button onClick={() => setTab('whatsapp')}
            className={`shrink-0 flex-1 min-w-[7rem] h-11 rounded-xl font-bold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${tab === 'whatsapp' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
            <MessageCircle size={16} /> WhatsApp
          </button>
          <button onClick={() => setTab('ruas')}
            className={`shrink-0 flex-1 min-w-[7rem] h-11 rounded-xl font-bold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${tab === 'ruas' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
            <MapPin size={16} /> Ruas de Entrega
          </button>
        </div>

        {tab === 'estabelecimento' ? (
          <EstablishmentTab onSaved={() => { void refresh(); }} />
        ) : tab === 'pagamento' ? <PaymentTab /> : tab === 'preparo' ? <PrepTimeTab /> : tab === 'links' ? <LinksTab /> : tab === 'whatsapp' ? <WhatsappTab /> : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
            <h3 className="text-white font-black uppercase text-sm">Ruas de Entrega</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Gerencie ruas aprovadas: taxa, tempo, observações, ativar/desativar e excluir.
            </p>
            <Link href="/admin/ruas-entrega">
              <Button className="w-full h-11 rounded-xl font-bold">Abrir Ruas de Entrega</Button>
            </Link>
            <Link href="/admin/novas-ruas">
              <Button variant="outline" className="w-full h-11 rounded-xl font-bold border-zinc-700">
                📍 Ver Novas Ruas
              </Button>
            </Link>
          </div>
        )}
      </main>

      <AdminNav active="/admin/config" />
    </div>
  );
}
