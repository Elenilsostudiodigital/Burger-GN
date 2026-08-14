import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getClubeDashboard, getClubeSettings, updateClubeSettings,
  getClubeMembers, createClubeMember, updateClubeMember, deleteClubeMember,
  getClubeLoyalty, createClubeLoyalty, updateClubeLoyalty, deleteClubeLoyalty,
  getClubeCashback, updateClubeCashback,
  getClubeFidelity, updateClubeFidelity,
  getClubeExclusiveCoupons, createClubeExclusiveCoupon, updateClubeExclusiveCoupon, deleteClubeExclusiveCoupon,
  getClubeBirthdayBenefits, createClubeBirthdayBenefit, updateClubeBirthdayBenefit, deleteClubeBirthdayBenefit,
  getClubeEarlyPromotions, createClubeEarlyPromotion, updateClubeEarlyPromotion, deleteClubeEarlyPromotion,
  ClubeDashboard, ClubeSettings, ClubeMember, ClubeLoyaltyReward,
  ClubeExclusiveCoupon, ClubeBirthdayBenefit, ClubeEarlyPromotion,
  ClubeMemberTier, ClubeDiscountType, ClubeCashbackData, ClubeFidelitySettings,
} from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import {
  LayoutDashboard, UtensilsCrossed, Tag, MapPin, Navigation, Settings, LogOut,
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, Upload, TrendingUp,
  Crown, Gift, Wallet, Ticket, Cake, Zap, Users, BarChart3, Percent, DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminTab, AdminTabBar } from '../../components/AdminTabs';

type Tab =
  | 'dashboard'
  | 'fidelidade'
  | 'cashback'
  | 'cupons'
  | 'aniversario'
  | 'promocoes'
  | 'membros'
  | 'config';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={14} /> },
  { id: 'fidelidade', label: 'Fidelidade', icon: <Gift size={14} /> },
  { id: 'cashback', label: 'Cashback', icon: <Wallet size={14} /> },
  { id: 'cupons', label: 'Cupons Exclusivos', icon: <Ticket size={14} /> },
  { id: 'aniversario', label: 'Benefícios de Aniversário', icon: <Cake size={14} /> },
  { id: 'promocoes', label: 'Promoções Antecipadas', icon: <Zap size={14} /> },
  { id: 'membros', label: 'Cadastro de Membros', icon: <Users size={14} /> },
  { id: 'config', label: 'Configurações', icon: <Settings size={14} /> },
];

const TIER_LABEL: Record<ClubeMemberTier, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  diamante: 'Diamante',
};

function AdminNav({ active }: { active: string }) {
  const navItems = [
    { href: '/admin', icon: <TrendingUp size={17} />, label: 'Início' },
    { href: '/admin/pedidos', icon: <LayoutDashboard size={18} />, label: 'Pedidos' },
    { href: '/admin/cardapio', icon: <UtensilsCrossed size={18} />, label: 'Cardápio' },
    { href: '/admin/financeiro', icon: <TrendingUp size={18} />, label: 'Financeiro' },
    { href: '/admin/cupons', icon: <Tag size={18} />, label: 'Cupons' },
    { href: '/admin/clube', icon: <Crown size={18} />, label: 'Clube Burger' },
    { href: '/admin/taxas', icon: <MapPin size={18} />, label: 'Bairros' },
    { href: '/admin/entrega-km', icon: <Navigation size={18} />, label: 'Por KM' },
    { href: '/admin/config', icon: <Settings size={18} />, label: 'Config' },
    { href: '/admin/importar', icon: <Upload size={18} />, label: 'Importar' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
      <div className="admin-shell flex overflow-x-auto no-scrollbar">
        {navItems.map(item => (
          <Link key={item.href} href={item.href} className="flex-1 min-w-[64px]">
            <div className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors ${active === item.href ? 'text-amber-500' : 'text-zinc-500 hover:text-white'}`}>
              {item.icon}
              <span className="text-[8px] font-bold uppercase text-center leading-tight px-0.5">{item.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </nav>
  );
}

const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const toDateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
const toDateTimeLocal = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ClubeBurger() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [dashboard, setDashboard] = useState<ClubeDashboard | null>(null);
  const [settings, setSettings] = useState<ClubeSettings | null>(null);
  const [members, setMembers] = useState<ClubeMember[]>([]);
  const [loyalty, setLoyalty] = useState<ClubeLoyaltyReward[]>([]);
  const [fidelity, setFidelity] = useState<ClubeFidelitySettings | null>(null);
  const [cashback, setCashback] = useState<ClubeCashbackData | null>(null);
  const [exclusive, setExclusive] = useState<ClubeExclusiveCoupon[]>([]);
  const [birthdays, setBirthdays] = useState<ClubeBirthdayBenefit[]>([]);
  const [promos, setPromos] = useState<ClubeEarlyPromotion[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});

  const handleLogout = async () => { await logout(); setLocation('/'); };

  const loadTab = async (t: Tab) => {
    setLoading(true);
    setError('');
    setShowForm(false);
    setEditId(null);
    try {
      if (t === 'dashboard') setDashboard(await getClubeDashboard());
      else if (t === 'fidelidade') {
        const [rewards, fidelityCfg] = await Promise.all([getClubeLoyalty(), getClubeFidelity()]);
        setLoyalty(rewards);
        setFidelity(fidelityCfg);
      }
      else if (t === 'cashback') setCashback(await getClubeCashback());
      else if (t === 'cupons') setExclusive(await getClubeExclusiveCoupons());
      else if (t === 'aniversario') setBirthdays(await getClubeBirthdayBenefits());
      else if (t === 'promocoes') setPromos(await getClubeEarlyPromotions());
      else if (t === 'membros') setMembers(await getClubeMembers());
      else if (t === 'config') setSettings(await getClubeSettings());
    } catch {
      setError('Erro ao carregar dados do Clube Burger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTab(tab); }, [tab]);

  const openCreate = (defaults: Record<string, string | boolean>) => {
    setEditId(null);
    setForm(defaults);
    setShowForm(true);
    setError('');
  };

  // ── Save handlers ──────────────────────────────────────────────────────────
  const saveLoyalty = async () => {
    if (!String(form.title || '').trim() || !form.pointsCost) {
      setError('Preencha título e custo em pontos'); return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        title: String(form.title).trim(),
        description: String(form.description || ''),
        pointsCost: parseInt(String(form.pointsCost), 10),
        active: Boolean(form.active),
      };
      if (editId) {
        const updated = await updateClubeLoyalty(editId, payload);
        setLoyalty(prev => prev.map(x => x.id === updated.id ? updated : x));
      } else {
        const created = await createClubeLoyalty(payload);
        setLoyalty(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { setError('Erro ao salvar recompensa'); }
    finally { setSaving(false); }
  };

  const saveExclusive = async () => {
    if (!String(form.code || '').trim() || !form.discountValue) {
      setError('Preencha código e valor'); return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        code: String(form.code).toUpperCase().trim(),
        title: String(form.title || ''),
        description: String(form.description || ''),
        discountType: (form.discountType as ClubeDiscountType) || 'percentage',
        discountValue: (parseFloat(String(form.discountValue)) || 0).toFixed(2),
        minOrderValue: (parseFloat(String(form.minOrderValue)) || 0).toFixed(2),
        maxUses: form.maxUses ? parseInt(String(form.maxUses), 10) : null,
        active: Boolean(form.active),
        expiresAt: form.expiresAt ? String(form.expiresAt) : null,
      };
      if (editId) {
        const updated = await updateClubeExclusiveCoupon(editId, payload);
        setExclusive(prev => prev.map(x => x.id === updated.id ? updated : x));
      } else {
        const created = await createClubeExclusiveCoupon(payload);
        setExclusive(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error && err.message.includes('409') ? 'Código já existe' : 'Erro ao salvar cupom');
    } finally { setSaving(false); }
  };

  const saveBirthday = async () => {
    if (!String(form.title || '').trim()) { setError('Informe o título'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        title: String(form.title).trim(),
        description: String(form.description || ''),
        discountType: (form.discountType as ClubeDiscountType) || 'percentage',
        discountValue: (parseFloat(String(form.discountValue)) || 0).toFixed(2),
        active: Boolean(form.active),
      };
      if (editId) {
        const updated = await updateClubeBirthdayBenefit(editId, payload);
        setBirthdays(prev => prev.map(x => x.id === updated.id ? updated : x));
      } else {
        const created = await createClubeBirthdayBenefit(payload);
        setBirthdays(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { setError('Erro ao salvar benefício'); }
    finally { setSaving(false); }
  };

  const savePromo = async () => {
    if (!String(form.title || '').trim() || !form.earlyAccessAt || !form.startsAt) {
      setError('Preencha título, acesso antecipado e início'); return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        title: String(form.title).trim(),
        description: String(form.description || ''),
        discountType: (form.discountType as ClubeDiscountType) || 'percentage',
        discountValue: (parseFloat(String(form.discountValue)) || 0).toFixed(2),
        earlyAccessAt: new Date(String(form.earlyAccessAt)).toISOString(),
        startsAt: new Date(String(form.startsAt)).toISOString(),
        endsAt: form.endsAt ? new Date(String(form.endsAt)).toISOString() : null,
        active: Boolean(form.active),
      };
      if (editId) {
        const updated = await updateClubeEarlyPromotion(editId, payload);
        setPromos(prev => prev.map(x => x.id === updated.id ? updated : x));
      } else {
        const created = await createClubeEarlyPromotion(payload);
        setPromos(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { setError('Erro ao salvar promoção'); }
    finally { setSaving(false); }
  };

  const saveMember = async () => {
    if (!String(form.name || '').trim()) { setError('Informe o nome'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        name: String(form.name).trim(),
        email: String(form.email || ''),
        phone: String(form.phone || ''),
        birthDate: form.birthDate ? String(form.birthDate) : null,
        points: parseInt(String(form.points || '0'), 10) || 0,
        cashbackBalance: (parseFloat(String(form.cashbackBalance || '0')) || 0).toFixed(2),
        tier: (form.tier as ClubeMemberTier) || 'bronze',
        active: Boolean(form.active),
        notes: String(form.notes || ''),
      };
      if (editId) {
        const updated = await updateClubeMember(editId, payload);
        setMembers(prev => prev.map(x => x.id === updated.id ? updated : x));
      } else {
        const created = await createClubeMember(payload);
        setMembers(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error && err.message.includes('409') ? 'Telefone já cadastrado' : 'Erro ao salvar membro');
    } finally { setSaving(false); }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true); setError('');
    try {
      const updated = await updateClubeSettings({
        enabled: settings.enabled,
        clubName: settings.clubName,
        welcomeMessage: settings.welcomeMessage,
        pointsPerReal: settings.pointsPerReal,
        pointsRedeemValue: settings.pointsRedeemValue,
        cashbackPercent: settings.cashbackPercent,
        cashbackMinOrder: settings.cashbackMinOrder,
        fidelityEnabled: settings.fidelityEnabled,
        stampsRequired: settings.stampsRequired,
        stampRewardTitle: settings.stampRewardTitle,
        cashbackEnabled: settings.cashbackEnabled,
        cashbackMaxPerOrder: settings.cashbackMaxPerOrder ?? null,
        birthdayDiscountType: settings.birthdayDiscountType,
        birthdayDiscountValue: settings.birthdayDiscountValue,
        birthdayDaysBefore: settings.birthdayDaysBefore,
        birthdayDaysAfter: settings.birthdayDaysAfter,
        earlyAccessHours: settings.earlyAccessHours,
      });
      setSettings(updated);
    } catch { setError('Erro ao salvar configurações'); }
    finally { setSaving(false); }
  };

  const DiscountTypeToggle = ({ value, onChange }: { value: ClubeDiscountType; onChange: (v: ClubeDiscountType) => void }) => (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onChange('percentage')}
        className={`flex items-center justify-center gap-2 h-11 rounded-xl border font-bold text-sm transition-all ${value === 'percentage' ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}>
        <Percent size={16} /> Porcentagem
      </button>
      <button type="button" onClick={() => onChange('fixed')}
        className={`flex items-center justify-center gap-2 h-11 rounded-xl border font-bold text-sm transition-all ${value === 'fixed' ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}>
        <DollarSign size={16} /> Valor Fixo
      </button>
    </div>
  );

  const Empty = ({ text }: { text: string }) => (
    <div className="text-center py-12 text-zinc-600">
      <Crown size={36} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="admin-shell flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Clube Burger</h1>
              <p className="text-zinc-600 text-xs">Programa de fidelidade • The Burger GN</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="admin-shell px-4 py-5 space-y-5">
        <AdminTabBar>
          {TABS.map(t => (
            <AdminTab key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} icon={t.icon}>
              {t.label}
            </AdminTab>
          ))}
        </AdminTabBar>

        {error && (
          <div className="bg-red-950/40 border border-red-900 text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-amber-500" size={28} />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

              {/* ── Dashboard ── */}
              {tab === 'dashboard' && dashboard && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Membros', value: dashboard.members, color: 'text-amber-500' },
                      { label: 'Ativos', value: dashboard.activeMembers, color: 'text-green-400' },
                      { label: 'Pontos', value: dashboard.totalPoints, color: 'text-purple-400' },
                      { label: 'Cashback', value: fmt(dashboard.totalCashback), color: 'text-emerald-400' },
                      { label: 'Cupons', value: dashboard.exclusiveCoupons, color: 'text-amber-400' },
                      { label: 'Promoções', value: dashboard.activePromos, color: 'text-sky-400' },
                    ].map(s => (
                      <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
                        <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        <p className="text-zinc-500 text-xs uppercase tracking-wider mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                    <h3 className="text-white font-bold uppercase text-sm mb-3 flex items-center gap-2">
                      <Cake size={16} className="text-amber-500" /> Aniversariantes (7 dias)
                    </h3>
                    {dashboard.upcomingBirthdays.length === 0 ? (
                      <p className="text-zinc-600 text-sm">Nenhum aniversário próximo.</p>
                    ) : (
                      <div className="space-y-2">
                        {dashboard.upcomingBirthdays.map(m => (
                          <div key={m.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5">
                            <div>
                              <p className="text-white text-sm font-bold">{m.name}</p>
                              <p className="text-zinc-500 text-xs">{m.phone || m.email || '—'}</p>
                            </div>
                            <span className="text-amber-500 text-xs font-bold">
                              {m.birthDate ? new Date(m.birthDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── Fidelidade ── */}
              {tab === 'fidelidade' && (
                <>
                  {fidelity && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-white font-bold uppercase text-sm flex items-center gap-2">
                            <Gift size={16} className="text-amber-500" /> Cartão de selos
                          </h3>
                          <p className="text-zinc-500 text-xs mt-1">
                            +1 selo automático quando o pedido é concluído (sem duplicar).
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFidelity(f => f ? { ...f, fidelityEnabled: !f.fidelityEnabled } : f)}
                          className={fidelity.fidelityEnabled ? 'text-green-400' : 'text-zinc-600'}
                          aria-label="Ativar ou desativar fidelidade"
                        >
                          {fidelity.fidelityEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Selos necessários para recompensa</Label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={String(fidelity.stampsRequired)}
                          onChange={e => setFidelity(f => f ? { ...f, stampsRequired: parseInt(e.target.value || '10', 10) || 10 } : f)}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Recompensa oferecida</Label>
                        <Input
                          value={fidelity.stampRewardTitle}
                          onChange={e => setFidelity(f => f ? { ...f, stampRewardTitle: e.target.value } : f)}
                          placeholder="Ex: 1 hambúrguer grátis"
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Validade da fidelidade</Label>
                        <select
                          value={fidelity.fidelityExpiryMode || 'none'}
                          onChange={e => setFidelity(f => f ? {
                            ...f,
                            fidelityExpiryMode: e.target.value as 'none' | 'days' | 'date',
                          } : f)}
                          className="w-full bg-zinc-950 border border-zinc-800 text-white h-11 rounded-md px-3 focus:border-amber-500"
                        >
                          <option value="none">Sem validade</option>
                          <option value="days">Definir validade (dias)</option>
                          <option value="date">Data específica</option>
                        </select>
                      </div>
                      {(fidelity.fidelityExpiryMode || 'none') === 'days' && (
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Dias de validade</Label>
                          <select
                            value={String(fidelity.fidelityExpiryDays ?? 30)}
                            onChange={e => setFidelity(f => f ? {
                              ...f,
                              fidelityExpiryDays: parseInt(e.target.value, 10) || 30,
                            } : f)}
                            className="w-full bg-zinc-950 border border-zinc-800 text-white h-11 rounded-md px-3 focus:border-amber-500"
                          >
                            {[15, 30, 60, 90, 180, 365].map(d => (
                              <option key={d} value={d}>{d} dias</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {(fidelity.fidelityExpiryMode || 'none') === 'date' && (
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Data de validade</Label>
                          <Input
                            type="date"
                            value={fidelity.fidelityExpiryDate || ''}
                            onChange={e => setFidelity(f => f ? { ...f, fidelityExpiryDate: e.target.value || null } : f)}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
                          />
                        </div>
                      )}
                      <p className="text-zinc-500 text-xs">
                        Exemplo: {fidelity.stampsRequired || 10} selos = {fidelity.stampRewardTitle || '1 hambúrguer grátis'}.
                      </p>
                      <Button
                        onClick={async () => {
                          setSaving(true); setError('');
                          try {
                            const updated = await updateClubeFidelity({
                              fidelityEnabled: fidelity.fidelityEnabled,
                              stampsRequired: fidelity.stampsRequired,
                              stampRewardTitle: fidelity.stampRewardTitle,
                              fidelityExpiryMode: fidelity.fidelityExpiryMode || 'none',
                              fidelityExpiryDays: fidelity.fidelityExpiryDays ?? null,
                              fidelityExpiryDate: fidelity.fidelityExpiryDate ?? null,
                              fidelityWarningDays: fidelity.fidelityWarningDays ?? 7,
                            });
                            setFidelity(updated);
                          } catch { setError('Erro ao salvar fidelidade'); }
                          finally { setSaving(false); }
                        }}
                        disabled={saving}
                        className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl"
                      >
                        {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar cartão de selos'}
                      </Button>
                    </div>
                  )}

                  <div className="pt-1">
                    <h3 className="text-white font-bold uppercase text-sm mb-2">Recompensas por pontos (catálogo)</h3>
                    <p className="text-zinc-500 text-xs mb-3">Catálogo opcional separado do cartão de selos automático.</p>
                  </div>
                  <Button onClick={() => openCreate({ title: '', description: '', pointsCost: '', active: true })}
                    className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                    <Plus size={16} className="mr-2" /> Nova Recompensa
                  </Button>
                  {showForm && (
                    <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4">
                      <h3 className="text-white font-bold uppercase text-sm">{editId ? 'Editar' : 'Nova'} Recompensa</h3>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Título *</Label>
                        <Input value={String(form.title || '')} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Descrição</Label>
                        <Input value={String(form.description || '')} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Custo em pontos *</Label>
                        <Input type="number" value={String(form.pointsCost || '')} onChange={e => setForm(f => ({ ...f, pointsCost: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={saveLoyalty} disabled={saving} className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                          {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar'}
                        </Button>
                        <Button onClick={() => setShowForm(false)} variant="outline" className="h-11 border-zinc-700 text-zinc-300 rounded-xl">Cancelar</Button>
                      </div>
                    </div>
                  )}
                  {loyalty.length === 0 ? <Empty text="Nenhuma recompensa cadastrada." /> : (
                    <div className="space-y-2">
                      {loyalty.map(r => (
                        <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white font-bold text-sm truncate">{r.title}</p>
                            <p className="text-zinc-500 text-xs">{r.pointsCost} pts {r.description ? `• ${r.description}` : ''}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={async () => {
                              const updated = await updateClubeLoyalty(r.id, { active: !r.active });
                              setLoyalty(prev => prev.map(x => x.id === updated.id ? updated : x));
                            }} className={r.active ? 'text-green-400' : 'text-zinc-600'}>
                              {r.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                            </button>
                            <button onClick={() => { setEditId(r.id); setForm({ title: r.title, description: r.description, pointsCost: String(r.pointsCost), active: r.active }); setShowForm(true); }}
                              className="p-1.5 text-zinc-400 hover:text-amber-500"><Pencil size={16} /></button>
                            <button onClick={async () => { if (!confirm('Excluir?')) return; await deleteClubeLoyalty(r.id); setLoyalty(prev => prev.filter(x => x.id !== r.id)); }}
                              className="p-1.5 text-red-500"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Cashback ── */}
              {tab === 'cashback' && cashback && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
                      <p className="text-2xl font-black text-amber-500">{parseFloat(cashback.cashbackPercent).toFixed(0)}%</p>
                      <p className="text-zinc-500 text-xs uppercase mt-0.5">Percentual</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
                      <p className="text-2xl font-black text-green-400">{fmt(cashback.totalBalance)}</p>
                      <p className="text-zinc-500 text-xs uppercase mt-0.5">Saldo total</p>
                    </div>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-white font-bold uppercase text-sm flex items-center gap-2">
                        <Wallet size={16} className="text-amber-500" /> Regras de Cashback
                      </h3>
                      <button
                        type="button"
                        onClick={() => setCashback(c => c ? { ...c, cashbackEnabled: !(c.cashbackEnabled ?? true) } : c)}
                        className={(cashback.cashbackEnabled ?? true) ? 'text-green-400' : 'text-zinc-600'}
                        aria-label="Ativar ou desativar cashback"
                      >
                        {(cashback.cashbackEnabled ?? true) ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                      </button>
                    </div>
                    <p className="text-zinc-500 text-xs">
                      Creditado automaticamente no pedido concluído (sem duplicar o mesmo pedido).
                    </p>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Percentual de cashback (%)</Label>
                      <Input type="number" value={String(form.cashbackPercent ?? cashback.cashbackPercent)}
                        onChange={e => setForm(f => ({ ...f, cashbackPercent: e.target.value, cashbackMinOrder: f.cashbackMinOrder ?? cashback.cashbackMinOrder }))}
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Pedido mínimo (R$)</Label>
                      <Input type="number" value={String(form.cashbackMinOrder ?? cashback.cashbackMinOrder)}
                        onChange={e => setForm(f => ({ ...f, cashbackMinOrder: e.target.value, cashbackPercent: f.cashbackPercent ?? cashback.cashbackPercent }))}
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Limite máximo por pedido (R$) — vazio = sem limite</Label>
                      <Input type="number" value={String(form.cashbackMaxPerOrder ?? cashback.cashbackMaxPerOrder ?? '')}
                        onChange={e => setForm(f => ({
                          ...f,
                          cashbackMaxPerOrder: e.target.value,
                          cashbackPercent: f.cashbackPercent ?? cashback.cashbackPercent,
                          cashbackMinOrder: f.cashbackMinOrder ?? cashback.cashbackMinOrder,
                        }))}
                        placeholder="Opcional"
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">% máximo utilizável no pedido — vazio = 100%</Label>
                      <Input type="number" min={0} max={100}
                        value={String(form.cashbackMaxUsePercent ?? cashback.cashbackMaxUsePercent ?? '')}
                        onChange={e => setForm(f => ({
                          ...f,
                          cashbackMaxUsePercent: e.target.value,
                          cashbackPercent: f.cashbackPercent ?? cashback.cashbackPercent,
                          cashbackMinOrder: f.cashbackMinOrder ?? cashback.cashbackMinOrder,
                        }))}
                        placeholder="Ex: 30"
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      <p className="text-zinc-600 text-[11px]">
                        Ex.: pedido R$ 100 e limite 30% → cliente usa no máximo R$ 30 mesmo com saldo maior.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Validade do cashback</Label>
                      <select
                        value={String(form.cashbackExpiryMode ?? cashback.cashbackExpiryMode ?? 'none')}
                        onChange={e => setForm(f => ({
                          ...f,
                          cashbackExpiryMode: e.target.value,
                          cashbackPercent: f.cashbackPercent ?? cashback.cashbackPercent,
                          cashbackMinOrder: f.cashbackMinOrder ?? cashback.cashbackMinOrder,
                        }))}
                        className="w-full bg-zinc-950 border border-zinc-800 text-white h-11 rounded-md px-3 focus:border-amber-500"
                      >
                        <option value="none">Sem validade</option>
                        <option value="days">Definir validade (dias)</option>
                        <option value="date">Data específica</option>
                      </select>
                    </div>
                    {(String(form.cashbackExpiryMode ?? cashback.cashbackExpiryMode ?? 'none') === 'days') && (
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Dias de validade</Label>
                        <select
                          value={String(form.cashbackExpiryDays ?? cashback.cashbackExpiryDays ?? 30)}
                          onChange={e => setForm(f => ({
                            ...f,
                            cashbackExpiryDays: e.target.value,
                            cashbackPercent: f.cashbackPercent ?? cashback.cashbackPercent,
                            cashbackMinOrder: f.cashbackMinOrder ?? cashback.cashbackMinOrder,
                          }))}
                          className="w-full bg-zinc-950 border border-zinc-800 text-white h-11 rounded-md px-3 focus:border-amber-500"
                        >
                          {[15, 30, 60, 90, 180, 365].map(d => (
                            <option key={d} value={d}>{d} dias</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {(String(form.cashbackExpiryMode ?? cashback.cashbackExpiryMode ?? 'none') === 'date') && (
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Data de validade</Label>
                        <Input
                          type="date"
                          value={String(form.cashbackExpiryDate ?? cashback.cashbackExpiryDate ?? '')}
                          onChange={e => setForm(f => ({
                            ...f,
                            cashbackExpiryDate: e.target.value,
                            cashbackPercent: f.cashbackPercent ?? cashback.cashbackPercent,
                            cashbackMinOrder: f.cashbackMinOrder ?? cashback.cashbackMinOrder,
                          }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500"
                        />
                      </div>
                    )}
                    <Button onClick={async () => {
                      setSaving(true); setError('');
                      try {
                        const maxRaw = String(form.cashbackMaxPerOrder ?? cashback.cashbackMaxPerOrder ?? '').trim();
                        const maxUseRaw = String(form.cashbackMaxUsePercent ?? cashback.cashbackMaxUsePercent ?? '').trim();
                        const expiryMode = (form.cashbackExpiryMode ?? cashback.cashbackExpiryMode ?? 'none') as 'none' | 'days' | 'date';
                        await updateClubeCashback({
                          cashbackEnabled: cashback.cashbackEnabled ?? true,
                          cashbackPercent: (parseFloat(String(form.cashbackPercent ?? cashback.cashbackPercent)) || 0).toFixed(2),
                          cashbackMinOrder: (parseFloat(String(form.cashbackMinOrder ?? cashback.cashbackMinOrder)) || 0).toFixed(2),
                          cashbackMaxPerOrder: maxRaw === '' ? null : (parseFloat(maxRaw) || 0).toFixed(2),
                          cashbackMaxUsePercent: maxUseRaw === '' ? null : (parseFloat(maxUseRaw) || 0).toFixed(2),
                          cashbackExpiryMode: expiryMode,
                          cashbackExpiryDays: expiryMode === 'days'
                            ? (parseInt(String(form.cashbackExpiryDays ?? cashback.cashbackExpiryDays ?? 30), 10) || 30)
                            : null,
                          cashbackExpiryDate: expiryMode === 'date'
                            ? (String(form.cashbackExpiryDate ?? cashback.cashbackExpiryDate ?? '') || null)
                            : null,
                          cashbackWarningDays: cashback.cashbackWarningDays ?? 7,
                        });
                        setCashback(await getClubeCashback());
                      } catch { setError('Erro ao salvar cashback'); }
                      finally { setSaving(false); }
                    }} disabled={saving} className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                      {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar regras'}
                    </Button>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                    <h3 className="text-white font-bold uppercase text-sm mb-3">Membros com saldo</h3>
                    {cashback.membersWithBalance.length === 0 ? (
                      <p className="text-zinc-600 text-sm">Nenhum saldo acumulado ainda.</p>
                    ) : (
                      <div className="space-y-2">
                        {cashback.membersWithBalance.map(m => (
                          <div key={m.id} className="flex justify-between items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5">
                            <p className="text-white text-sm font-bold">{m.name}</p>
                            <p className="text-green-400 text-sm font-bold">{fmt(parseFloat(m.cashbackBalance))}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── Cupons exclusivos ── */}
              {tab === 'cupons' && (
                <>
                  <Button onClick={() => openCreate({ code: '', title: '', description: '', discountType: 'percentage', discountValue: '', minOrderValue: '0', maxUses: '', expiresAt: '', active: true })}
                    className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                    <Plus size={16} className="mr-2" /> Novo Cupom Exclusivo
                  </Button>
                  {showForm && (
                    <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4">
                      <h3 className="text-white font-bold uppercase text-sm">{editId ? 'Editar' : 'Novo'} Cupom</h3>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Código *</Label>
                        <Input value={String(form.code || '')} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 font-mono tracking-widest focus:border-amber-500" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Título</Label>
                        <Input value={String(form.title || '')} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Tipo de desconto</Label>
                        <DiscountTypeToggle value={(form.discountType as ClubeDiscountType) || 'percentage'}
                          onChange={v => setForm(f => ({ ...f, discountType: v }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Valor *</Label>
                          <Input type="number" value={String(form.discountValue || '')} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Pedido mín.</Label>
                          <Input type="number" value={String(form.minOrderValue || '')} onChange={e => setForm(f => ({ ...f, minOrderValue: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Máx. usos</Label>
                          <Input type="number" value={String(form.maxUses || '')} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Validade</Label>
                          <Input type="date" value={String(form.expiresAt || '')} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={saveExclusive} disabled={saving} className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                          {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar'}
                        </Button>
                        <Button onClick={() => setShowForm(false)} variant="outline" className="h-11 border-zinc-700 text-zinc-300 rounded-xl">Cancelar</Button>
                      </div>
                    </div>
                  )}
                  {exclusive.length === 0 ? <Empty text="Nenhum cupom exclusivo." /> : (
                    <div className="space-y-2">
                      {exclusive.map(c => (
                        <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-amber-500 font-mono font-bold text-sm">{c.code}</p>
                            <p className="text-zinc-400 text-xs">
                              {c.discountType === 'percentage' ? `${parseFloat(c.discountValue)}%` : fmt(parseFloat(c.discountValue))}
                              {c.title ? ` • ${c.title}` : ''} • {c.usedCount} usos
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={async () => {
                              const updated = await updateClubeExclusiveCoupon(c.id, { active: !c.active });
                              setExclusive(prev => prev.map(x => x.id === updated.id ? updated : x));
                            }} className={c.active ? 'text-green-400' : 'text-zinc-600'}>
                              {c.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                            </button>
                            <button onClick={() => {
                              setEditId(c.id);
                              setForm({
                                code: c.code, title: c.title, description: c.description,
                                discountType: c.discountType, discountValue: c.discountValue,
                                minOrderValue: c.minOrderValue, maxUses: c.maxUses != null ? String(c.maxUses) : '',
                                expiresAt: toDateInput(c.expiresAt), active: c.active,
                              });
                              setShowForm(true);
                            }} className="p-1.5 text-zinc-400 hover:text-amber-500"><Pencil size={16} /></button>
                            <button onClick={async () => { if (!confirm('Excluir?')) return; await deleteClubeExclusiveCoupon(c.id); setExclusive(prev => prev.filter(x => x.id !== c.id)); }}
                              className="p-1.5 text-red-500"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Aniversário ── */}
              {tab === 'aniversario' && (
                <>
                  <Button onClick={() => openCreate({ title: '', description: '', discountType: 'percentage', discountValue: '15', active: true })}
                    className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                    <Plus size={16} className="mr-2" /> Novo Benefício
                  </Button>
                  {showForm && (
                    <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4">
                      <h3 className="text-white font-bold uppercase text-sm">{editId ? 'Editar' : 'Novo'} Benefício</h3>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Título *</Label>
                        <Input value={String(form.title || '')} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Descrição</Label>
                        <Input value={String(form.description || '')} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <DiscountTypeToggle value={(form.discountType as ClubeDiscountType) || 'percentage'}
                        onChange={v => setForm(f => ({ ...f, discountType: v }))} />
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Valor do desconto</Label>
                        <Input type="number" value={String(form.discountValue || '')} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={saveBirthday} disabled={saving} className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                          {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar'}
                        </Button>
                        <Button onClick={() => setShowForm(false)} variant="outline" className="h-11 border-zinc-700 text-zinc-300 rounded-xl">Cancelar</Button>
                      </div>
                    </div>
                  )}
                  {birthdays.length === 0 ? <Empty text="Nenhum benefício de aniversário." /> : (
                    <div className="space-y-2">
                      {birthdays.map(b => (
                        <div key={b.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white font-bold text-sm truncate">{b.title}</p>
                            <p className="text-zinc-500 text-xs">
                              {b.discountType === 'percentage' ? `${parseFloat(b.discountValue)}%` : fmt(parseFloat(b.discountValue))}
                              {b.description ? ` • ${b.description}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={async () => {
                              const updated = await updateClubeBirthdayBenefit(b.id, { active: !b.active });
                              setBirthdays(prev => prev.map(x => x.id === updated.id ? updated : x));
                            }} className={b.active ? 'text-green-400' : 'text-zinc-600'}>
                              {b.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                            </button>
                            <button onClick={() => {
                              setEditId(b.id);
                              setForm({ title: b.title, description: b.description, discountType: b.discountType, discountValue: b.discountValue, active: b.active });
                              setShowForm(true);
                            }} className="p-1.5 text-zinc-400 hover:text-amber-500"><Pencil size={16} /></button>
                            <button onClick={async () => { if (!confirm('Excluir?')) return; await deleteClubeBirthdayBenefit(b.id); setBirthdays(prev => prev.filter(x => x.id !== b.id)); }}
                              className="p-1.5 text-red-500"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Promoções antecipadas ── */}
              {tab === 'promocoes' && (
                <>
                  <Button onClick={() => openCreate({ title: '', description: '', discountType: 'percentage', discountValue: '10', earlyAccessAt: '', startsAt: '', endsAt: '', active: true })}
                    className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                    <Plus size={16} className="mr-2" /> Nova Promoção
                  </Button>
                  {showForm && (
                    <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4">
                      <h3 className="text-white font-bold uppercase text-sm">{editId ? 'Editar' : 'Nova'} Promoção</h3>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Título *</Label>
                        <Input value={String(form.title || '')} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Descrição</Label>
                        <Input value={String(form.description || '')} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <DiscountTypeToggle value={(form.discountType as ClubeDiscountType) || 'percentage'}
                        onChange={v => setForm(f => ({ ...f, discountType: v }))} />
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Valor do desconto</Label>
                        <Input type="number" value={String(form.discountValue || '')} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Acesso antecipado (membros) *</Label>
                        <Input type="datetime-local" value={String(form.earlyAccessAt || '')} onChange={e => setForm(f => ({ ...f, earlyAccessAt: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Início público *</Label>
                          <Input type="datetime-local" value={String(form.startsAt || '')} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Fim</Label>
                          <Input type="datetime-local" value={String(form.endsAt || '')} onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={savePromo} disabled={saving} className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                          {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar'}
                        </Button>
                        <Button onClick={() => setShowForm(false)} variant="outline" className="h-11 border-zinc-700 text-zinc-300 rounded-xl">Cancelar</Button>
                      </div>
                    </div>
                  )}
                  {promos.length === 0 ? <Empty text="Nenhuma promoção antecipada." /> : (
                    <div className="space-y-2">
                      {promos.map(p => (
                        <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white font-bold text-sm truncate">{p.title}</p>
                            <p className="text-zinc-500 text-xs">
                              Antecipado: {new Date(p.earlyAccessAt).toLocaleString('pt-BR')}
                            </p>
                            <p className="text-zinc-600 text-xs">
                              Público: {new Date(p.startsAt).toLocaleString('pt-BR')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={async () => {
                              const updated = await updateClubeEarlyPromotion(p.id, { active: !p.active });
                              setPromos(prev => prev.map(x => x.id === updated.id ? updated : x));
                            }} className={p.active ? 'text-green-400' : 'text-zinc-600'}>
                              {p.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                            </button>
                            <button onClick={() => {
                              setEditId(p.id);
                              setForm({
                                title: p.title, description: p.description, discountType: p.discountType,
                                discountValue: p.discountValue, earlyAccessAt: toDateTimeLocal(p.earlyAccessAt),
                                startsAt: toDateTimeLocal(p.startsAt), endsAt: toDateTimeLocal(p.endsAt), active: p.active,
                              });
                              setShowForm(true);
                            }} className="p-1.5 text-zinc-400 hover:text-amber-500"><Pencil size={16} /></button>
                            <button onClick={async () => { if (!confirm('Excluir?')) return; await deleteClubeEarlyPromotion(p.id); setPromos(prev => prev.filter(x => x.id !== p.id)); }}
                              className="p-1.5 text-red-500"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Membros ── */}
              {tab === 'membros' && (
                <>
                  <Button onClick={() => openCreate({ name: '', email: '', phone: '', birthDate: '', points: '0', cashbackBalance: '0', tier: 'bronze', notes: '', active: true })}
                    className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                    <Plus size={16} className="mr-2" /> Novo Membro
                  </Button>
                  {showForm && (
                    <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4">
                      <h3 className="text-white font-bold uppercase text-sm">{editId ? 'Editar' : 'Novo'} Membro</h3>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Nome *</Label>
                        <Input value={String(form.name || '')} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Telefone</Label>
                          <Input value={String(form.phone || '')} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">E-mail</Label>
                          <Input type="email" value={String(form.email || '')} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Nascimento</Label>
                          <Input type="date" value={String(form.birthDate || '')} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Nível</Label>
                          <select value={String(form.tier || 'bronze')} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}
                            className="w-full h-11 rounded-md bg-zinc-950 border border-zinc-800 text-white text-sm px-3 focus:border-amber-500 outline-none">
                            {(Object.keys(TIER_LABEL) as ClubeMemberTier[]).map(t => (
                              <option key={t} value={t}>{TIER_LABEL[t]}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Pontos</Label>
                          <Input type="number" value={String(form.points || '0')} onChange={e => setForm(f => ({ ...f, points: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Cashback (R$)</Label>
                          <Input type="number" value={String(form.cashbackBalance || '0')} onChange={e => setForm(f => ({ ...f, cashbackBalance: e.target.value }))}
                            className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-zinc-400 text-xs">Observações</Label>
                        <Input value={String(form.notes || '')} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={saveMember} disabled={saving} className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                          {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar'}
                        </Button>
                        <Button onClick={() => setShowForm(false)} variant="outline" className="h-11 border-zinc-700 text-zinc-300 rounded-xl">Cancelar</Button>
                      </div>
                    </div>
                  )}
                  {members.length === 0 ? <Empty text="Nenhum membro cadastrado." /> : (
                    <div className="admin-card-grid-2">
                      {members.map(m => (
                        <div key={m.id} className="admin-card bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white font-bold text-sm truncate">{m.name}</p>
                            <p className="text-zinc-500 text-xs">
                              {TIER_LABEL[m.tier]} • {m.points} pts • {fmt(parseFloat(m.cashbackBalance))}
                            </p>
                            <p className="text-zinc-600 text-xs truncate">{m.phone || m.email || '—'}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={async () => {
                              const updated = await updateClubeMember(m.id, { active: !m.active });
                              setMembers(prev => prev.map(x => x.id === updated.id ? updated : x));
                            }} className={m.active ? 'text-green-400' : 'text-zinc-600'}>
                              {m.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                            </button>
                            <button onClick={() => {
                              setEditId(m.id);
                              setForm({
                                name: m.name, email: m.email, phone: m.phone,
                                birthDate: toDateInput(m.birthDate), points: String(m.points),
                                cashbackBalance: m.cashbackBalance, tier: m.tier, notes: m.notes, active: m.active,
                              });
                              setShowForm(true);
                            }} className="p-1.5 text-zinc-400 hover:text-amber-500"><Pencil size={16} /></button>
                            <button onClick={async () => { if (!confirm('Excluir membro?')) return; await deleteClubeMember(m.id); setMembers(prev => prev.filter(x => x.id !== m.id)); }}
                              className="p-1.5 text-red-500"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Configurações ── */}
              {tab === 'config' && settings && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-bold uppercase text-sm">Configurações do Clube</h3>
                    <button onClick={() => setSettings(s => s ? { ...s, enabled: !s.enabled } : s)}
                      className={settings.enabled ? 'text-green-400' : 'text-zinc-600'}>
                      {settings.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Nome do clube</Label>
                    <Input value={settings.clubName} onChange={e => setSettings(s => s ? { ...s, clubName: e.target.value } : s)}
                      className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Mensagem de boas-vindas</Label>
                    <Input value={settings.welcomeMessage} onChange={e => setSettings(s => s ? { ...s, welcomeMessage: e.target.value } : s)}
                      className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Pontos por R$ 1</Label>
                      <Input type="number" value={settings.pointsPerReal}
                        onChange={e => setSettings(s => s ? { ...s, pointsPerReal: e.target.value } : s)}
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Valor do ponto (R$)</Label>
                      <Input type="number" value={settings.pointsRedeemValue}
                        onChange={e => setSettings(s => s ? { ...s, pointsRedeemValue: e.target.value } : s)}
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Cashback (%)</Label>
                      <Input type="number" value={settings.cashbackPercent}
                        onChange={e => setSettings(s => s ? { ...s, cashbackPercent: e.target.value } : s)}
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Cashback pedido mín.</Label>
                      <Input type="number" value={settings.cashbackMinOrder}
                        onChange={e => setSettings(s => s ? { ...s, cashbackMinOrder: e.target.value } : s)}
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Desc. aniversário</Label>
                      <Input type="number" value={settings.birthdayDiscountValue}
                        onChange={e => setSettings(s => s ? { ...s, birthdayDiscountValue: e.target.value } : s)}
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Acesso antecipado (h)</Label>
                      <Input type="number" value={settings.earlyAccessHours}
                        onChange={e => setSettings(s => s ? { ...s, earlyAccessHours: parseInt(e.target.value || '0', 10) } : s)}
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Dias antes aniversário</Label>
                      <Input type="number" value={settings.birthdayDaysBefore}
                        onChange={e => setSettings(s => s ? { ...s, birthdayDaysBefore: parseInt(e.target.value || '0', 10) } : s)}
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Dias depois aniversário</Label>
                      <Input type="number" value={settings.birthdayDaysAfter}
                        onChange={e => setSettings(s => s ? { ...s, birthdayDaysAfter: parseInt(e.target.value || '0', 10) } : s)}
                        className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
                    </div>
                  </div>
                  <Button onClick={saveSettings} disabled={saving} className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl">
                    {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar configurações'}
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <AdminNav active="/admin/clube" />
    </div>
  );
}
