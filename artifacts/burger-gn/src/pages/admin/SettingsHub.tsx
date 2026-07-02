import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAdminPaymentSettings, updatePaymentSettings, PaymentSettingsAdmin,
  getAdminExternalLinks, createExternalLink, updateExternalLink, deleteExternalLink, ExternalLink,
} from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import {
  LayoutDashboard, UtensilsCrossed, Tag, MapPin, Navigation, Settings,
  LogOut, Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight,
  Loader2, CreditCard, Link as LinkIcon, ShieldAlert, ShieldCheck, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function AdminNav({ active }: { active: string }) {
  const items = [
    { href: '/admin', icon: <LayoutDashboard size={17} />, label: 'Pedidos' },
    { href: '/admin/cardapio', icon: <UtensilsCrossed size={17} />, label: 'Cardápio' },
    { href: '/admin/cupons', icon: <Tag size={17} />, label: 'Cupons' },
    { href: '/admin/taxas', icon: <MapPin size={17} />, label: 'Bairros' },
    { href: '/admin/entrega-km', icon: <Navigation size={17} />, label: 'Por KM' },
    { href: '/admin/config', icon: <Settings size={17} />, label: 'Config' },
    { href: '/admin/importar', icon: <Upload size={17} />, label: 'Importar' },
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

type Tab = 'pagamento' | 'links';

function PaymentTab() {
  const [settings, setSettings] = useState<PaymentSettingsAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(false);
  const [cashOnDelivery, setCashOnDelivery] = useState(true);
  const [accessToken, setAccessToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const s = await getAdminPaymentSettings();
    setSettings(s);
    setOnline(s.onlinePaymentEnabled);
    setCashOnDelivery(s.cashOnDeliveryEnabled);
    setPublicKey(s.mercadoPagoPublicKey);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true); setSuccess(false); setError('');
    try {
      const updated = await updatePaymentSettings({
        onlinePaymentEnabled: online,
        cashOnDeliveryEnabled: cashOnDelivery,
        gatewayProvider: 'mercadopago',
        mercadoPagoAccessToken: accessToken.trim() || undefined,
        mercadoPagoPublicKey: publicKey.trim(),
      });
      setSettings(updated);
      setAccessToken('');
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
      {/* Gateway status */}
      <div className={`rounded-2xl p-5 border flex items-start gap-3 ${settings.mercadoPagoConfigured ? 'bg-green-900/10 border-green-800/40' : 'bg-orange-900/10 border-orange-800/40'}`}>
        {settings.mercadoPagoConfigured
          ? <ShieldCheck size={22} className="text-green-400 mt-0.5 shrink-0" />
          : <ShieldAlert size={22} className="text-orange-400 mt-0.5 shrink-0" />}
        <div>
          <p className={`font-bold text-sm ${settings.mercadoPagoConfigured ? 'text-green-400' : 'text-orange-400'}`}>
            {settings.mercadoPagoConfigured ? 'Mercado Pago conectado' : 'Mercado Pago não conectado'}
          </p>
          <p className="text-zinc-500 text-xs mt-1 leading-relaxed">
            {settings.mercadoPagoConfigured
              ? 'Suas credenciais estão salvas. Pix (QR code + copia-e-cola) e Cartão de crédito/débito são processados automaticamente pelo Mercado Pago.'
              : 'Cole abaixo o Access Token da sua conta Mercado Pago para aceitar Pix e Cartão automaticamente, caindo direto na sua conta.'}
          </p>
        </div>
      </div>

      {/* Mercado Pago credentials */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <Label className="text-zinc-400 text-xs uppercase font-bold">Credenciais do Mercado Pago</Label>
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

export default function SettingsHub() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>('pagamento');

  const handleLogout = async () => { await logout(); setLocation('/'); };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Configurações</h1>
              <p className="text-zinc-600 text-xs">Pagamento e Links Externos</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <div className="flex gap-2">
          <button onClick={() => setTab('pagamento')}
            className={`flex-1 h-11 rounded-xl font-bold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${tab === 'pagamento' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
            <CreditCard size={16} /> Pagamento
          </button>
          <button onClick={() => setTab('links')}
            className={`flex-1 h-11 rounded-xl font-bold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${tab === 'links' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
            <LinkIcon size={16} /> Links Externos
          </button>
        </div>

        {tab === 'pagamento' ? <PaymentTab /> : <LinksTab />}
      </main>

      <AdminNav active="/admin/config" />
    </div>
  );
}
