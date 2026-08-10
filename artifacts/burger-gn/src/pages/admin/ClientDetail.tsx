import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import {
  Users, LogOut, ArrowLeft, Loader2, Wallet, Award,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  getClientDetail, ClientDetailResponse, ClientOrigin,
} from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';

const ORIGIN_LABEL: Record<ClientOrigin, string> = {
  pedido: 'Pedido',
  importacao_manual: 'Importação manual',
  cadastro_administrativo: 'Cadastro administrativo',
  outro: 'Outro',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Novo',
  preparing: 'Em preparo',
  delivery: 'Entrega',
  done: 'Concluído',
  cancelled: 'Cancelado',
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
  return v;
}

function formatDateTime(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

export default function ClientDetail() {
  const { logout } = useAdmin();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<ClientDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      setError('Cliente inválido');
      setLoading(false);
      return;
    }
    setLoading(true);
    getClientDetail(id)
      .then(setData)
      .catch(() => setError('Não foi possível carregar o cliente'))
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/clientes" className="p-2 text-zinc-400 hover:text-white">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Cliente</h1>
              <p className="text-zinc-600 text-xs">Histórico e fidelidade</p>
            </div>
          </div>
          <button type="button" onClick={async () => { await logout(); setLocation('/'); }}
            className="p-2 text-zinc-400 hover:text-red-400">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {loading && (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber-500" size={28} /></div>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {data && (
          <>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Users size={20} className="text-amber-500 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-white font-black text-lg leading-tight">{data.client.name}</p>
                  <p className="text-zinc-400 text-sm font-mono">{formatPhone(data.client.phone)}</p>
                  <p className="text-zinc-500 text-xs mt-1">
                    Origem: {ORIGIN_LABEL[data.client.origin] || data.client.origin}
                    {' · '}Cadastro: {formatDateTime(data.client.joinedAt || data.client.createdAt)}
                  </p>
                  {data.client.notes ? (
                    <p className="text-zinc-400 text-xs mt-2">{data.client.notes}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1"><Award size={12} /> Selos</p>
                  <p className="text-amber-400 font-black text-xl">{data.client.stamps}</p>
                </div>
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1"><Wallet size={12} /> Cashback</p>
                  <p className="text-green-400 font-black text-xl">{fmt(data.client.cashbackBalance)}</p>
                </div>
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold">Pedidos</p>
                  <p className="text-white font-black text-xl">{data.client.orderCount}</p>
                </div>
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold">Total gasto</p>
                  <p className="text-white font-black text-xl">{fmt(data.client.totalSpent)}</p>
                </div>
              </div>

              <p className="text-zinc-500 text-xs">
                Último pedido: {formatDateTime(data.client.lastOrderAt)}
                {data.client.lastOrderNumber != null ? ` (#${data.client.lastOrderNumber})` : ''}
              </p>

              {/* Recovery-ready hints (not a full recovery module). */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.recoveryHints.novo && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-sky-500/30 text-sky-400">Novo</span>}
                {data.recoveryHints.recorrente && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-green-500/30 text-green-400">Recorrente</span>}
                {data.recoveryHints.vip && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-400">VIP</span>}
                {data.recoveryHints.semComprar7dias && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-orange-500/30 text-orange-400">Sem comprar 7d</span>}
                {data.recoveryHints.semComprar15dias && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-orange-500/30 text-orange-300">Sem comprar 15d</span>}
                {data.recoveryHints.semComprar30dias && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-red-500/30 text-red-400">Sem comprar 30d</span>}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-white font-black uppercase text-sm tracking-wide">Histórico de Pedidos</h2>
              {data.history.length === 0 ? (
                <p className="text-zinc-600 text-sm py-8 text-center">Nenhum pedido vinculado a este WhatsApp.</p>
              ) : (
                data.history.map((o) => (
                  <Link key={o.id} href={`/admin`} className="block">
                    <article className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex items-center justify-between gap-3 hover:border-amber-500/40 transition-colors">
                      <div>
                        <p className="text-white font-bold text-sm">Pedido #{o.orderNumber}</p>
                        <p className="text-zinc-500 text-xs">{formatDateTime(o.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-amber-400 font-black text-sm">{fmt(o.total)}</p>
                        <p className="text-zinc-500 text-[10px] uppercase font-bold">
                          {STATUS_LABEL[o.status] || o.status}
                        </p>
                      </div>
                    </article>
                  </Link>
                ))
              )}
            </section>
          </>
        )}
      </main>

      <AdminBottomNav active="/admin/clientes" />
    </div>
  );
}
