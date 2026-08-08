import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Users, LogOut, Search, Pencil, Trash2, Plus, Minus, Loader2,
  UserPlus, List, Wallet, X, Check,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  getClients, updateClient, deleteClient, adjustClientStamps, adjustClientCashback,
  ClubClient, ClientOrigin, CLIENT_ORIGIN_OPTIONS,
} from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ORIGIN_LABEL: Record<ClientOrigin, string> = {
  manual: 'Manual',
  sistema_burger_gn: 'Sistema Burger GN',
  importado: 'Importado',
};

const ORIGIN_CLASS: Record<ClientOrigin, string> = {
  manual: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  sistema_burger_gn: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  importado: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
};

function fmt(v: string | number) {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')}`;
}

function formatPhone(v: string) {
  const n = v.replace(/\D/g, '');
  if (n.length === 13 && n.startsWith('55')) {
    return `+55 (${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
  }
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  return v;
}

export default function ClientsList() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [clients, setClients] = useState<ClubClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [origin, setOrigin] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [edit, setEdit] = useState<ClubClient | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', stamps: '0', cashback: '0', origin: 'manual' as ClientOrigin, notes: '' });
  const [cashModal, setCashModal] = useState<{ client: ClubClient; mode: 'add' | 'remove' } | null>(null);
  const [cashAmount, setCashAmount] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await getClients({ q: q.trim() || undefined, origin: origin || undefined });
      setClients(data.clients);
    } catch {
      setError('Erro ao carregar clientes');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [q, origin]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const run = async (id: number, fn: () => Promise<void>) => {
    setBusyId(id); setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operação falhou');
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (c: ClubClient) => {
    setEdit(c);
    setEditForm({
      name: c.name,
      phone: c.phone,
      stamps: String(c.stamps),
      cashback: String(parseFloat(c.cashbackBalance) || 0),
      origin: c.origin,
      notes: c.notes || '',
    });
  };

  const saveEdit = async () => {
    if (!edit) return;
    await run(edit.id, async () => {
      await updateClient(edit.id, {
        name: editForm.name,
        phone: editForm.phone,
        stamps: parseInt(editForm.stamps || '0', 10) || 0,
        cashbackBalance: parseFloat(editForm.cashback.replace(',', '.') || '0') || 0,
        origin: editForm.origin,
        notes: editForm.notes,
      });
      setEdit(null);
      setToast('Cliente atualizado');
      setTimeout(() => setToast(''), 2500);
    });
  };

  const applyCash = async () => {
    if (!cashModal) return;
    const amount = Math.abs(parseFloat(cashAmount.replace(',', '.') || '0') || 0);
    if (amount <= 0) { setError('Informe um valor válido'); return; }
    const signed = cashModal.mode === 'add' ? amount : -amount;
    await run(cashModal.client.id, async () => {
      await adjustClientCashback(cashModal.client.id, signed);
      setCashModal(null);
      setCashAmount('');
      setToast(cashModal.mode === 'add' ? 'Cashback adicionado' : 'Cashback removido');
      setTimeout(() => setToast(''), 2500);
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Clientes</h1>
              <p className="text-zinc-600 text-xs">Clube Burger GN · {clients.length} cadastros</p>
            </div>
          </div>
          <button type="button" onClick={async () => { await logout(); setLocation('/'); }}
            className="p-2 text-zinc-400 hover:text-red-400">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 h-11 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs uppercase flex items-center justify-center gap-1.5">
            <List size={15} /> Lista de Clientes
          </div>
          <Link href="/admin/clientes/importar" className="flex-1">
            <div className="h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold text-xs uppercase flex items-center justify-center gap-1.5 hover:border-amber-500/40">
              <UserPlus size={15} /> Importação Manual
            </div>
          </Link>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, WhatsApp ou origem…"
              className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button type="button" onClick={() => setOrigin('')}
              className={`shrink-0 h-9 px-3 rounded-lg text-[11px] font-bold uppercase ${!origin ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 border border-zinc-800 text-zinc-400'}`}>
              Todas
            </button>
            {CLIENT_ORIGIN_OPTIONS.map((o) => (
              <button key={o.id} type="button" onClick={() => setOrigin(o.id)}
                className={`shrink-0 h-9 px-3 rounded-lg text-[11px] font-bold uppercase ${origin === o.id ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 border border-zinc-800 text-zinc-400'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {toast && <p className="text-green-400 text-sm flex items-center gap-2"><Check size={14} /> {toast}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber-500" size={28} /></div>
        ) : clients.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-zinc-600 text-sm">Nenhum cliente encontrado.</p>
            <Link href="/admin/clientes/importar">
              <Button className="bg-amber-500 text-zinc-950 font-bold rounded-xl">Importação Manual</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map((c) => (
              <article key={c.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm truncate">{c.name}</p>
                    <p className="text-zinc-400 text-xs font-mono">{formatPhone(c.phone)}</p>
                    <p className="text-zinc-600 text-[11px] mt-0.5">
                      Cadastro: {new Date(c.joinedAt || c.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${ORIGIN_CLASS[c.origin]}`}>
                    {ORIGIN_LABEL[c.origin]}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
                    <p className="text-zinc-500 text-[10px] uppercase font-bold">Selos</p>
                    <p className="text-amber-400 font-black text-lg leading-none mt-0.5">
                      {'🍔'.repeat(Math.min(c.stamps, 12))}{c.stamps > 12 ? '…' : ''}
                      <span className="text-sm ml-1">{c.stamps}</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
                    <p className="text-zinc-500 text-[10px] uppercase font-bold">Cashback</p>
                    <p className="text-green-400 font-black text-lg leading-none mt-0.5">{fmt(c.cashbackBalance)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button type="button" disabled={busyId === c.id} onClick={() => openEdit(c)}
                    className="h-9 px-2.5 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-black uppercase flex items-center gap-1">
                    <Pencil size={13} /> Editar
                  </button>
                  <button type="button" disabled={busyId === c.id}
                    onClick={() => run(c.id, async () => {
                      const res = await adjustClientStamps(c.id, 1);
                      if (res.rewardUnlocked) setToast(`Recompensa liberada para ${c.name}`);
                      else setToast('Selo adicionado');
                      setTimeout(() => setToast(''), 2500);
                    })}
                    className="h-9 px-2.5 rounded-lg bg-amber-500/15 text-amber-400 text-[10px] font-black uppercase flex items-center gap-1">
                    <Plus size={13} /> Selo
                  </button>
                  <button type="button" disabled={busyId === c.id || c.stamps <= 0}
                    onClick={() => run(c.id, async () => {
                      await adjustClientStamps(c.id, -1);
                      setToast('Selo removido');
                      setTimeout(() => setToast(''), 2500);
                    })}
                    className="h-9 px-2.5 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-black uppercase flex items-center gap-1">
                    <Minus size={13} /> Selo
                  </button>
                  <button type="button" disabled={busyId === c.id}
                    onClick={() => { setCashModal({ client: c, mode: 'add' }); setCashAmount(''); }}
                    className="h-9 px-2.5 rounded-lg bg-green-500/15 text-green-400 text-[10px] font-black uppercase flex items-center gap-1">
                    <Wallet size={13} /> + Cash
                  </button>
                  <button type="button" disabled={busyId === c.id || parseFloat(c.cashbackBalance) <= 0}
                    onClick={() => { setCashModal({ client: c, mode: 'remove' }); setCashAmount(''); }}
                    className="h-9 px-2.5 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-black uppercase flex items-center gap-1">
                    <Wallet size={13} /> − Cash
                  </button>
                  <button type="button" disabled={busyId === c.id}
                    onClick={() => {
                      if (!confirm(`Excluir ${c.name}?`)) return;
                      void run(c.id, async () => { await deleteClient(c.id); });
                    }}
                    className="h-9 px-2.5 rounded-lg bg-red-950/40 text-red-400 text-[10px] font-black uppercase flex items-center gap-1">
                    <Trash2 size={13} /> Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Edit modal */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setEdit(null)}>
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-black uppercase text-sm">Editar cliente</h2>
              <button type="button" onClick={() => setEdit(null)} className="text-zinc-500"><X size={18} /></button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Nome</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">WhatsApp</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white h-11 font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Selos</Label>
                <Input type="number" value={editForm.stamps} onChange={(e) => setEditForm((f) => ({ ...f, stamps: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Cashback</Label>
                <Input type="number" value={editForm.cashback} onChange={(e) => setEditForm((f) => ({ ...f, cashback: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Origem</Label>
              <select value={editForm.origin}
                onChange={(e) => setEditForm((f) => ({ ...f, origin: e.target.value as ClientOrigin }))}
                className="w-full h-11 rounded-md bg-zinc-900 border border-zinc-800 text-white text-sm px-2">
                {CLIENT_ORIGIN_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Observações</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white h-11" />
            </div>
            <Button onClick={() => void saveEdit()} disabled={busyId === edit.id}
              className="w-full h-11 bg-amber-500 text-zinc-950 font-bold rounded-xl">
              {busyId === edit.id ? <Loader2 className="animate-spin" size={16} /> : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {/* Cashback modal */}
      {cashModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setCashModal(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-white font-black uppercase text-sm">
              {cashModal.mode === 'add' ? 'Adicionar cashback' : 'Remover cashback'}
            </h2>
            <p className="text-zinc-500 text-xs">{cashModal.client.name} · saldo {fmt(cashModal.client.cashbackBalance)}</p>
            <Input type="number" min={0} step="0.01" value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)} placeholder="Valor em R$"
              className="bg-zinc-900 border-zinc-800 text-white h-11" />
            <Button onClick={() => void applyCash()} disabled={busyId === cashModal.client.id}
              className="w-full h-11 bg-amber-500 text-zinc-950 font-bold rounded-xl">
              Confirmar
            </Button>
          </div>
        </div>
      )}

      <AdminBottomNav active="/admin/clientes" />
    </div>
  );
}
