import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAdminCoupons, getCouponStats, createCoupon, updateCoupon, deleteCoupon,
  Coupon, DiscountType,
} from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import {
  Tag, LogOut,
  Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight,
  Loader2, Percent, DollarSign, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminBottomNav } from '../../components/AdminBottomNav';

interface CouponForm {
  code: string; discountType: DiscountType; discountValue: string;
  minOrderValue: string; maxUses: string; active: boolean; expiresAt: string;
}

const emptyForm = (): CouponForm => ({
  code: '', discountType: 'percentage', discountValue: '',
  minOrderValue: '0', maxUses: '', active: true, expiresAt: '',
});

export default function Coupons() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [stats, setStats] = useState({ active: 0, totalDiscount: 0, totalUses: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true);
    const [data, s] = await Promise.all([getAdminCoupons(), getCouponStats()]);
    setCoupons(data);
    setStats(s);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => { setShowForm(false); setEditCoupon(null); setForm(emptyForm()); setFormError(''); };

  const openEdit = (c: Coupon) => {
    setEditCoupon(c);
    setForm({
      code: c.code, discountType: c.discountType, discountValue: c.discountValue,
      minOrderValue: c.minOrderValue, maxUses: c.maxUses !== null ? String(c.maxUses) : '',
      active: c.active, expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.discountValue) { setFormError('Preencha código e valor do desconto'); return; }
    const val = parseFloat(form.discountValue);
    if (isNaN(val) || val <= 0) { setFormError('Valor do desconto inválido'); return; }
    if (form.discountType === 'percentage' && val > 100) { setFormError('Porcentagem não pode ser maior que 100'); return; }
    setSaving(true); setFormError('');
    try {
      const payload = {
        code: form.code.toUpperCase().trim(),
        discountType: form.discountType,
        discountValue: val.toFixed(2),
        minOrderValue: (parseFloat(form.minOrderValue) || 0).toFixed(2),
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        active: form.active,
        expiresAt: form.expiresAt ? form.expiresAt : null,
      };
      if (editCoupon) {
        const updated = await updateCoupon(editCoupon.id, payload);
        setCoupons(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else {
        const created = await createCoupon(payload);
        setCoupons(prev => [...prev, created]);
      }
      getCouponStats().then(setStats);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error && err.message.includes('409') ? 'Código já existe' : 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleToggle = async (c: Coupon) => {
    const updated = await updateCoupon(c.id, { active: !c.active });
    setCoupons(prev => prev.map(x => x.id === updated.id ? updated : x));
    getCouponStats().then(setStats);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este cupom?')) return;
    await deleteCoupon(id);
    setCoupons(prev => prev.filter(c => c.id !== id));
    getCouponStats().then(setStats);
  };

  const handleLogout = async () => { await logout(); setLocation('/'); };

  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const fmtDiscount = (c: Coupon) => c.discountType === 'percentage'
    ? `${parseFloat(c.discountValue).toFixed(0)}%`
    : fmt(parseFloat(c.discountValue));

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Tag size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Cupons de Desconto</h1>
              <p className="text-zinc-600 text-xs">Gestão de promoções • The Burger GN</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-amber-500">{stats.active}</p>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mt-0.5">Ativos</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-green-400">{stats.totalUses}</p>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mt-0.5">Usos</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <p className="text-xl font-black text-purple-400">{fmt(stats.totalDiscount)}</p>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mt-0.5">Descontos</p>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4">
            <h3 className="text-white font-bold uppercase text-sm flex items-center gap-2">
              <Tag size={16} className="text-amber-500" />
              {editCoupon ? 'Editar Cupom' : 'Novo Cupom'}
            </h3>

            {/* Code */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Código do Cupom *</Label>
              <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="Ex: BURGER20" maxLength={20}
                className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm font-mono tracking-widest focus:border-amber-500" />
            </div>

            {/* Discount Type */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Tipo de Desconto *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, discountType: 'percentage' }))}
                  className={`flex items-center justify-center gap-2 h-11 rounded-xl border font-bold text-sm transition-all ${form.discountType === 'percentage' ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}>
                  <Percent size={16} /> Porcentagem
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, discountType: 'fixed' }))}
                  className={`flex items-center justify-center gap-2 h-11 rounded-xl border font-bold text-sm transition-all ${form.discountType === 'fixed' ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}>
                  <DollarSign size={16} /> Valor Fixo
                </button>
              </div>
            </div>

            {/* Discount Value + Min Order */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">
                  {form.discountType === 'percentage' ? 'Porcentagem (%) *' : 'Valor de Desconto (R$) *'}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">
                    {form.discountType === 'percentage' ? '%' : 'R$'}
                  </span>
                  <Input type="number" step="0.01" min="0" max={form.discountType === 'percentage' ? '100' : undefined}
                    value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                    placeholder="0" className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm pl-9 focus:border-amber-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Pedido Mínimo (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">R$</span>
                  <Input type="number" step="0.01" min="0"
                    value={form.minOrderValue} onChange={e => setForm(f => ({ ...f, minOrderValue: e.target.value }))}
                    placeholder="0" className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm pl-9 focus:border-amber-500" />
                </div>
              </div>
            </div>

            {/* Max Uses + Expiry */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Usos Máximos</Label>
                <Input type="number" min="1"
                  value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                  placeholder="Ilimitado" className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs flex items-center gap-1"><Calendar size={12} /> Validade</Label>
                <Input type="date"
                  value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                  className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between bg-zinc-950 rounded-xl px-4 py-3 border border-zinc-800">
              <span className="text-white text-sm font-bold">Cupom ativo</span>
              <button type="button" onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                className={`transition-colors ${form.active ? 'text-green-400' : 'text-zinc-600'}`}>
                {form.active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>

            {formError && <p className="text-red-400 text-xs">{formError}</p>}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl h-10 text-sm flex gap-1.5">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar
              </Button>
              <Button variant="outline" onClick={resetForm}
                className="flex-1 border-zinc-700 text-zinc-400 hover:bg-zinc-800 rounded-xl h-10 text-sm flex gap-1.5">
                <X size={16} /> Cancelar
              </Button>
            </div>
          </motion.div>
        )}

        {!showForm && (
          <Button onClick={() => { setEditCoupon(null); setForm(emptyForm()); setShowForm(true); }}
            className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
            <Plus size={18} /> Criar Cupom
          </Button>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {coupons.map(c => {
                const expired = c.expiresAt ? new Date(c.expiresAt) < new Date() : false;
                const exhausted = c.maxUses !== null && c.usedCount >= c.maxUses;
                const statusOk = c.active && !expired && !exhausted;
                return (
                  <motion.div key={c.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className={`bg-zinc-900 border rounded-xl p-4 transition-all ${statusOk ? 'border-zinc-800' : 'border-zinc-800/40 opacity-60'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-white font-mono tracking-wider text-base">{c.code}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusOk ? 'bg-green-900/30 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            {!c.active ? 'Inativo' : expired ? 'Expirado' : exhausted ? 'Esgotado' : 'Ativo'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {c.discountType === 'percentage' ? <Percent size={14} className="text-amber-500" /> : <DollarSign size={14} className="text-amber-500" />}
                          <span className="text-amber-500 font-bold">{fmtDiscount(c)}</span>
                          {parseFloat(c.minOrderValue) > 0 && (
                            <span className="text-zinc-600 text-xs ml-1">• mín. {fmt(parseFloat(c.minOrderValue))}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-zinc-600">
                          <span className="flex items-center gap-1">
                            <Tag size={12} className="text-zinc-700" />
                            {c.usedCount}{c.maxUses !== null ? `/${c.maxUses}` : ''} uso{c.usedCount !== 1 ? 's' : ''}
                          </span>
                          {c.expiresAt && (
                            <span className="flex items-center gap-1">
                              <Calendar size={12} className="text-zinc-700" />
                              até {new Date(c.expiresAt).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => handleToggle(c)}
                          className={`p-1.5 rounded-lg transition-colors ${c.active ? 'text-green-400 bg-green-900/30 hover:bg-green-900/50' : 'text-zinc-600 bg-zinc-800 hover:bg-zinc-700'}`}>
                          {c.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        </button>
                        <button onClick={() => openEdit(c)}
                          className="p-1.5 text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDelete(c.id)}
                          className="p-1.5 text-red-500 bg-red-900/20 hover:bg-red-900/40 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {coupons.length === 0 && !loading && (
              <div className="text-center py-12">
                <Tag size={40} className="text-zinc-800 mx-auto mb-3" />
                <p className="text-zinc-600">Nenhum cupom criado ainda.</p>
              </div>
            )}
          </div>
        )}
      </main>

      <AdminBottomNav active="/admin/cupons" />
    </div>
  );
}
