import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAdminDeliveryZones, createDeliveryZone, updateDeliveryZone, deleteDeliveryZone, DeliveryZone,
} from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import {
  LayoutDashboard, UtensilsCrossed, Tag, MapPin, LogOut, Settings,
  Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight, Loader2, Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function AdminNav({ active }: { active: string }) {
  const navItems = [
    { href: '/admin', icon: <LayoutDashboard size={18} />, label: 'Pedidos' },
    { href: '/admin/cardapio', icon: <UtensilsCrossed size={18} />, label: 'Cardápio' },
    { href: '/admin/cupons', icon: <Tag size={18} />, label: 'Cupons' },
    { href: '/admin/taxas', icon: <MapPin size={18} />, label: 'Bairros' },
    { href: '/admin/entrega-km', icon: <Navigation size={18} />, label: 'Por KM' },
    { href: '/admin/config', icon: <Settings size={18} />, label: 'Config' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
      <div className="max-w-2xl mx-auto flex">
        {navItems.map(item => (
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

export default function DeliveryZones() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editZone, setEditZone] = useState<DeliveryZone | null>(null);
  const [formNeighborhood, setFormNeighborhood] = useState('');
  const [formFee, setFormFee] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true);
    const data = await getAdminDeliveryZones();
    setZones(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setShowForm(false); setEditZone(null);
    setFormNeighborhood(''); setFormFee(''); setFormError('');
  };

  const openEdit = (zone: DeliveryZone) => {
    setEditZone(zone);
    setFormNeighborhood(zone.neighborhood);
    setFormFee(parseFloat(zone.fee).toFixed(2));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formNeighborhood.trim() || !formFee) { setFormError('Preencha todos os campos'); return; }
    const fee = parseFloat(formFee);
    if (isNaN(fee) || fee < 0) { setFormError('Taxa inválida'); return; }
    setSaving(true); setFormError('');
    try {
      if (editZone) {
        const updated = await updateDeliveryZone(editZone.id, { neighborhood: formNeighborhood, fee: fee.toFixed(2) });
        setZones(prev => prev.map(z => z.id === updated.id ? updated : z));
      } else {
        const created = await createDeliveryZone({ neighborhood: formNeighborhood, fee: fee.toFixed(2) });
        setZones(prev => [...prev, created]);
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error && err.message.includes('409') ? 'Bairro já cadastrado' : 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleToggle = async (zone: DeliveryZone) => {
    const updated = await updateDeliveryZone(zone.id, { active: !zone.active });
    setZones(prev => prev.map(z => z.id === updated.id ? updated : z));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este bairro?')) return;
    await deleteDeliveryZone(id);
    setZones(prev => prev.filter(z => z.id !== id));
  };

  const handleLogout = async () => { await logout(); setLocation('/'); };

  const activeCount = zones.filter(z => z.active).length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Taxas de Entrega</h1>
              <p className="text-zinc-600 text-xs">Bairros atendidos • The Burger GN</p>
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
            <p className="text-2xl font-black text-amber-500">{zones.length}</p>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mt-0.5">Cadastrados</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-green-400">{activeCount}</p>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mt-0.5">Ativos</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-zinc-400">{zones.length - activeCount}</p>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mt-0.5">Inativos</p>
          </div>
        </div>

        {/* Future GPS notice */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-3">
          <Navigation size={18} className="text-zinc-500 mt-0.5 shrink-0" />
          <p className="text-zinc-500 text-xs leading-relaxed">
            <span className="text-zinc-400 font-bold">Cálculo por distância (em breve):</span>{' '}
            O sistema está preparado para calcular taxas automaticamente por geolocalização via Google Maps API ou similar. Por enquanto, as taxas são por bairro.
          </p>
        </div>

        {/* Add form */}
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4">
            <h3 className="text-white font-bold uppercase text-sm flex items-center gap-2">
              <MapPin size={16} className="text-amber-500" />
              {editZone ? 'Editar Bairro' : 'Novo Bairro'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-zinc-400 text-xs">Nome do Bairro *</Label>
                <Input value={formNeighborhood} onChange={e => setFormNeighborhood(e.target.value)}
                  placeholder="Ex: Centro de Lauro de Freitas"
                  className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm focus:border-amber-500" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-zinc-400 text-xs">Taxa de Entrega (R$) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">R$</span>
                  <Input type="number" step="0.50" min="0" value={formFee} onChange={e => setFormFee(e.target.value)}
                    placeholder="0,00"
                    className="bg-zinc-950 border-zinc-800 text-white h-11 text-sm pl-9 focus:border-amber-500" />
                </div>
              </div>
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
          <Button onClick={() => { setEditZone(null); setFormNeighborhood(''); setFormFee(''); setShowForm(true); }}
            className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
            <Plus size={18} /> Adicionar Bairro
          </Button>
        )}

        {/* Zones list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {zones.map(zone => (
                <motion.div key={zone.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className={`bg-zinc-900 border rounded-xl px-4 py-3.5 flex items-center justify-between transition-all ${zone.active ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${zone.active ? 'bg-green-400' : 'bg-zinc-600'}`} />
                    <div className="min-w-0">
                      <p className={`font-bold text-sm ${zone.active ? 'text-white' : 'text-zinc-500'}`}>{zone.neighborhood}</p>
                      <p className="text-amber-500 font-black text-base">R$ {parseFloat(zone.fee).toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => handleToggle(zone)}
                      className={`p-1.5 rounded-lg transition-colors ${zone.active ? 'text-green-400 bg-green-900/30 hover:bg-green-900/50' : 'text-zinc-600 bg-zinc-800 hover:bg-zinc-700'}`}
                      title={zone.active ? 'Desativar' : 'Ativar'}>
                      {zone.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    <button onClick={() => openEdit(zone)}
                      className="p-1.5 text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleDelete(zone.id)}
                      className="p-1.5 text-red-500 bg-red-900/20 hover:bg-red-900/40 rounded-lg transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {zones.length === 0 && !loading && (
              <div className="text-center py-12">
                <MapPin size={40} className="text-zinc-800 mx-auto mb-3" />
                <p className="text-zinc-600">Nenhum bairro cadastrado ainda.</p>
              </div>
            )}
          </div>
        )}
      </main>

      <AdminNav active="/admin/taxas" />
    </div>
  );
}
