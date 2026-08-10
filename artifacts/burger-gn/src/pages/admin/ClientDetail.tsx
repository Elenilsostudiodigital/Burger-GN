import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import {
  Users, LogOut, ArrowLeft, Loader2, Wallet, Award, Gift, History,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  getClientDetail, redeemClientReward,
  ClientDetailResponse, ClientOrigin, ClientLedgerType,
} from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { Button } from '@/components/ui/button';

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

const LEDGER_LABEL: Record<ClientLedgerType, string> = {
  selo_pedido: 'Selo recebido',
  cashback_pedido: 'Cashback recebido',
  cashback_utilizado: 'Cashback utilizado',
  ajuste_selo: 'Ajuste de selos',
  ajuste_cashback: 'Ajuste de cashback',
  recompensa_disponivel: 'Recompensa disponível',
  recompensa_resgatada: 'Recompensa resgatada',
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
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  const load = async (id: number) => {
    setLoading(true);
    try {
      setData(await getClientDetail(id));
      setError('');
    } catch {
      setError('Não foi possível carregar o cliente');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      setError('Cliente inválido');
      setLoading(false);
      return;
    }
    load(id);
  }, [params.id]);

  const handleRedeem = async (rewardId: string) => {
    if (!data) return;
    if (!confirm('Confirmar resgate desta recompensa?')) return;
    setRedeemingId(rewardId);
    try {
      await redeemClientReward(data.client.id, rewardId);
      await load(data.client.id);
    } catch {
      setError('Não foi possível resgatar a recompensa');
    } finally {
      setRedeemingId(null);
    }
  };

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

              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.recoveryHints.novo && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-sky-500/30 text-sky-400">Novo</span>}
                {data.recoveryHints.recorrente && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-green-500/30 text-green-400">Recorrente</span>}
                {data.recoveryHints.vip && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-400">VIP</span>}
                {data.recoveryHints.semComprar7dias && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-orange-500/30 text-orange-400">Sem comprar 7d</span>}
                {data.recoveryHints.semComprar15dias && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-orange-500/30 text-orange-300">Sem comprar 15d</span>}
                {data.recoveryHints.semComprar30dias && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-red-500/30 text-red-400">Sem comprar 30d</span>}
              </div>
            </section>

            {data.fidelity && (
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-white font-black uppercase text-sm tracking-wide flex items-center gap-2">
                    <Gift size={16} className="text-amber-500" /> Fidelidade
                  </h2>
                  <span className={`text-[10px] font-bold uppercase ${data.fidelity.enabled ? 'text-green-400' : 'text-zinc-500'}`}>
                    {data.fidelity.enabled ? 'Ativa' : 'Desativada'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-2 py-2">
                    <p className="text-zinc-500 text-[10px] uppercase font-bold">Selos atuais</p>
                    <p className="text-amber-400 font-black text-lg">{data.fidelity.stamps}</p>
                  </div>
                  <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-2 py-2">
                    <p className="text-zinc-500 text-[10px] uppercase font-bold">Meta</p>
                    <p className="text-white font-black text-lg">{data.fidelity.goal}</p>
                  </div>
                  <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-2 py-2">
                    <p className="text-zinc-500 text-[10px] uppercase font-bold">Faltam</p>
                    <p className="text-white font-black text-lg">{data.fidelity.remaining}</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 uppercase font-bold mb-1">
                    <span>Progresso</span>
                    <span>{data.fidelity.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all"
                      style={{ width: `${Math.min(100, data.fidelity.progress)}%` }}
                    />
                  </div>
                  <p className="text-zinc-500 text-xs mt-2">
                    Recompensa: {data.fidelity.rewardTitle}
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <p className="text-zinc-400 text-xs font-bold uppercase">Recompensas disponíveis</p>
                  {data.fidelity.availableRewards.filter(r => r.available).length === 0 ? (
                    <p className="text-zinc-600 text-sm">Nenhuma recompensa disponível no momento.</p>
                  ) : (
                    data.fidelity.availableRewards.filter(r => r.available).map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-zinc-950 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-bold truncate">{r.title}</p>
                          <p className="text-zinc-500 text-xs">
                            {formatDateTime(r.earnedAt)}
                            {r.orderNumber != null ? ` · Pedido #${r.orderNumber}` : ''}
                          </p>
                        </div>
                        <Button
                          type="button"
                          disabled={redeemingId === r.id}
                          onClick={() => handleRedeem(r.id)}
                          className="h-9 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-lg shrink-0"
                        >
                          {redeemingId === r.id ? <Loader2 className="animate-spin" size={14} /> : 'Resgatar'}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-white font-black uppercase text-sm tracking-wide flex items-center gap-2">
                <History size={16} className="text-amber-500" /> Histórico de fidelidade
              </h2>
              {!data.ledger?.length ? (
                <p className="text-zinc-600 text-sm py-6 text-center">Nenhum movimento de selo/cashback ainda.</p>
              ) : (
                data.ledger.map((e) => (
                  <article key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white font-bold text-sm">
                          {LEDGER_LABEL[e.type] || e.type}
                        </p>
                        <p className="text-zinc-500 text-xs">{formatDateTime(e.at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {e.stampsDelta != null && e.stampsDelta !== 0 && (
                          <p className={`text-sm font-black ${e.stampsDelta > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                            {e.stampsDelta > 0 ? '+' : ''}{e.stampsDelta} selo{Math.abs(e.stampsDelta) === 1 ? '' : 's'}
                          </p>
                        )}
                        {e.cashbackDelta != null && e.cashbackDelta !== 0 && (
                          <p className={`text-sm font-black ${e.cashbackDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {e.cashbackDelta > 0 ? '+' : ''}{fmt(e.cashbackDelta)}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-zinc-500 text-xs">
                      {e.orderNumber != null ? `Pedido #${e.orderNumber}` : '—'}
                      {e.rewardTitle ? ` · ${e.rewardTitle}` : ''}
                      {e.description ? ` · ${e.description}` : ''}
                    </p>
                  </article>
                ))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-white font-black uppercase text-sm tracking-wide">Histórico de Pedidos</h2>
              {data.history.length === 0 ? (
                <p className="text-zinc-600 text-sm py-8 text-center">Nenhum pedido vinculado a este WhatsApp.</p>
              ) : (
                data.history.map((o) => (
                  <Link key={o.id} href={`/admin/pedidos`} className="block">
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
