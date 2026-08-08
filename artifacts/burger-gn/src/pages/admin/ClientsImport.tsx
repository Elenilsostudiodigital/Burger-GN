import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Users, LogOut, Plus, Check, Loader2, List, UserPlus } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  createClient, CLIENT_ORIGIN_OPTIONS, ClientOrigin,
} from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function formatPhone(v: string) {
  const n = v.replace(/\D/g, '').slice(0, 13);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `+${n.slice(0, 2)} ${n.slice(2)}`;
  if (n.length <= 9) return `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4)}`;
  return `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
}

export default function ClientsImport() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stamps, setStamps] = useState('0');
  const [cashback, setCashback] = useState('0');
  const [origin, setOrigin] = useState<ClientOrigin>('manual');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const client = await createClient({
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
        stamps: parseInt(stamps || '0', 10) || 0,
        cashbackBalance: parseFloat(cashback.replace(',', '.') || '0') || 0,
        origin,
        notes: notes.trim(),
      });
      setSuccess(`${client.name} entrou no Clube Burger GN.`);
      setName(''); setPhone(''); setStamps('0'); setCashback('0'); setNotes('');
      setOrigin('manual');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserPlus size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Importação Manual</h1>
              <p className="text-zinc-600 text-xs">Fidelidade e cashback de outro sistema</p>
            </div>
          </div>
          <button type="button" onClick={async () => { await logout(); setLocation('/'); }}
            className="p-2 text-zinc-400 hover:text-red-400">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <div className="flex gap-2">
          <Link href="/admin/clientes" className="flex-1">
            <div className="h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold text-xs uppercase flex items-center justify-center gap-1.5">
              <List size={15} /> Lista de Clientes
            </div>
          </Link>
          <div className="flex-1 h-11 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs uppercase flex items-center justify-center gap-1.5">
            <UserPlus size={15} /> Importação Manual
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs leading-relaxed">
            Cadastre clientes que já possuem selos ou cashback em outro sistema.
            Após salvar, eles passam a integrar o <strong className="text-amber-500">Clube Burger GN</strong>.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Nome completo *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Nome do cliente"
              className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">WhatsApp *</Label>
            <Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="+55 (71) 99999-0000"
              className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500 font-mono" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Quantidade de selos</Label>
              <Input type="number" min={0} value={stamps}
                onChange={(e) => setStamps(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Saldo de Cashback (R$)</Label>
              <Input type="number" min={0} step="0.01" value={cashback}
                onChange={(e) => setCashback(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Origem do cadastro *</Label>
            <div className="grid grid-cols-3 gap-2">
              {CLIENT_ORIGIN_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOrigin(o.id)}
                  className={`h-11 rounded-xl text-[11px] font-bold uppercase px-1 ${
                    origin === o.id
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Observações (opcional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Importado do Anota Aí"
              className="bg-zinc-950 border-zinc-800 text-white h-11 focus:border-amber-500" />
          </div>

          {success && (
            <p className="text-green-400 text-sm flex items-center gap-2">
              <Check size={16} /> {success}
            </p>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <Button onClick={handleSave} disabled={saving || !name.trim() || phone.replace(/\D/g, '').length < 10}
            className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            ➕ Salvar Cliente
          </Button>
        </div>

        <Link href="/admin/clientes" className="block text-center text-zinc-500 text-xs font-bold uppercase tracking-wider hover:text-amber-500">
          <Users size={14} className="inline mr-1" /> Ver lista de clientes
        </Link>
      </main>

      <AdminBottomNav active="/admin/clientes" />
    </div>
  );
}
