import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  getAdminDeliveryStreets,
  updateAdminDeliveryStreet,
  deleteAdminDeliveryStreet,
  DeliveryStreet,
} from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { ArrowLeft, Loader2, Pencil, Trash2, ToggleLeft, ToggleRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function fmtMoney(v: number) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

export default function AdminRuasEntrega() {
  const [list, setList] = useState<DeliveryStreet[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DeliveryStreet | null>(null);
  const [fee, setFee] = useState('');
  const [eta, setEta] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async (query = q) => {
    setLoading(true);
    try {
      setList(await getAdminDeliveryStreets(query));
    } catch {
      setError('Não foi possível carregar as ruas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh('');
  }, []);

  const openEdit = (s: DeliveryStreet) => {
    setEditing(s);
    setFee(String(s.fee));
    setEta(s.etaMinutes != null ? String(s.etaMinutes) : '');
    setNotes(s.notes || '');
    setError('');
  };

  const handleSave = async () => {
    if (!editing) return;
    const feeNum = parseFloat(fee.replace(',', '.'));
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      setError('Taxa inválida');
      return;
    }
    setSaving(true);
    try {
      await updateAdminDeliveryStreet(editing.id, {
        fee: feeNum,
        etaMinutes: eta ? Number(eta) : null,
        notes,
      });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: DeliveryStreet) => {
    try {
      await updateAdminDeliveryStreet(s.id, { active: !s.active });
      await refresh();
    } catch {
      setError('Não foi possível alterar o status');
    }
  };

  const handleDelete = async (s: DeliveryStreet) => {
    if (!confirm(`Excluir a rua "${s.streetName}"?`)) return;
    try {
      await deleteAdminDeliveryStreet(s.id);
      await refresh();
    } catch {
      setError('Não foi possível excluir');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      <header className="sticky top-0 z-30 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3 backdrop-blur">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/admin/config" className="p-2 text-zinc-400 hover:text-white">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-amber-500 text-[10px] font-bold uppercase tracking-widest">Configurações</p>
            <h1 className="font-black text-sm uppercase tracking-tight">Ruas de Entrega</h1>
          </div>
          <Link href="/admin/novas-ruas" className="ml-auto text-amber-500 text-[10px] font-bold uppercase">
            Novas Ruas
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void refresh(q); }}
              placeholder="Buscar rua, bairro ou cidade"
              className="bg-zinc-950 border-zinc-800 h-11 pl-9 text-white"
            />
          </div>
          <Button type="button" onClick={() => void refresh(q)} className="h-11 rounded-xl px-4">
            Buscar
          </Button>
        </div>

        {error ? <p className="text-red-400 text-sm">{error}</p> : null}

        {editing ? (
          <section className="rounded-2xl border border-amber-500/30 bg-zinc-900/80 p-4 space-y-3">
            <h2 className="text-white font-black text-sm">{editing.streetName}</h2>
            <p className="text-zinc-500 text-xs">{editing.neighborhood} · {editing.city}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-500 text-xs">Taxa</Label>
                <Input value={fee} onChange={(e) => setFee(e.target.value)} className="bg-zinc-950 border-zinc-800 h-11 text-white" />
              </div>
              <div>
                <Label className="text-zinc-500 text-xs">Tempo (min)</Label>
                <Input value={eta} onChange={(e) => setEta(e.target.value.replace(/\D/g, ''))} className="bg-zinc-950 border-zinc-800 h-11 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-zinc-500 text-xs">Observações</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-zinc-950 border-zinc-800 h-11 text-white" />
            </div>
            <div className="flex gap-2">
              <Button type="button" disabled={saving} onClick={() => void handleSave()} className="flex-1 h-11 rounded-xl">
                {saving ? <Loader2 className="animate-spin" size={16} /> : 'Salvar'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} className="h-11 rounded-xl border-zinc-700">
                Cancelar
              </Button>
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber-500" /></div>
        ) : list.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-10">Nenhuma rua cadastrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {list.map((s) => (
              <div key={s.id} className={`rounded-2xl border p-4 ${s.active ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-800/50 bg-zinc-950 opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm truncate">{s.streetName}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {s.neighborhood || '—'} · {s.city}
                      {s.distanceKm != null ? ` · ${s.distanceKm.toFixed(1)} km` : ''}
                      {s.etaMinutes != null ? ` · ${s.etaMinutes} min` : ''}
                    </p>
                    <p className="text-amber-400 text-sm font-black mt-1">{fmtMoney(s.fee)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => void toggleActive(s)} className="p-2 text-zinc-400 hover:text-amber-400" aria-label="Ativar/Desativar">
                      {s.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    <button type="button" onClick={() => openEdit(s)} className="p-2 text-zinc-400 hover:text-white" aria-label="Editar">
                      <Pencil size={16} />
                    </button>
                    <button type="button" onClick={() => void handleDelete(s)} className="p-2 text-zinc-400 hover:text-red-400" aria-label="Excluir">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <AdminBottomNav active="/admin/ruas-entrega" />
    </div>
  );
}
