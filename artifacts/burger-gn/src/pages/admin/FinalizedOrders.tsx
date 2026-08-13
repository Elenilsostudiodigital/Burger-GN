import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAdmin } from '../../context/AdminContext';
import {
  getOrders,
  Order,
  ORDER_TYPE_LABELS,
  WORKFLOW_LABELS,
  formatPaymentMethod,
} from '../../lib/api';
import { formatPrepDuration } from '../../lib/prepTimer';
import {
  LayoutDashboard, PackageCheck, Search, LogOut, ArrowLeft,
  TrendingUp, Receipt, Calculator,
} from 'lucide-react';

type PeriodFilter = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'all';
type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function inPeriod(iso: string | null | undefined, period: PeriodFilter): boolean {
  if (period === 'all') return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const now = new Date();
  const today0 = startOfDay(now);
  if (period === 'today') return t >= today0.getTime() && t <= endOfDay(now).getTime();
  if (period === 'yesterday') {
    const y = new Date(today0);
    y.setDate(y.getDate() - 1);
    return t >= startOfDay(y).getTime() && t <= endOfDay(y).getTime();
  }
  if (period === 'last7') {
    const from = new Date(today0);
    from.setDate(from.getDate() - 6);
    return t >= from.getTime() && t <= endOfDay(now).getTime();
  }
  if (period === 'thisMonth') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return t >= from.getTime() && t <= endOfDay(now).getTime();
  }
  // lastMonth
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return t >= from.getTime() && t <= to.getTime();
}

function money(v: string | number) {
  const n = typeof v === 'number' ? v : parseFloat(v || '0');
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function addressLine(o: Order) {
  if (o.orderType !== 'delivery') return ORDER_TYPE_LABELS[o.orderType] || o.orderType;
  const parts = [
    o.address,
    o.addressNumber,
    o.addressComplement,
    o.neighborhood,
    o.reference ? `Ref: ${o.reference}` : '',
  ].filter(Boolean);
  return parts.join(', ') || '—';
}

function isFinalized(o: Order) {
  return o.workflow === 'finalized';
}

const PERIODS: { key: PeriodFilter; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: 'last7', label: 'Últimos 7 dias' },
  { key: 'thisMonth', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês anterior' },
  { key: 'all', label: 'Todos' },
];

export default function FinalizedOrders() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [sort, setSort] = useState<SortKey>('newest');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const list = await getOrders();
        if (!alive) return;
        setOrders(Array.isArray(list) ? list.filter(isFinalized) : []);
      } catch {
        if (alive) setError('Não foi possível carregar os pedidos finalizados.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = orders.filter((o) => {
      const when = o.finalizedAt || o.deliveredAt || o.updatedAt || o.createdAt;
      if (!inPeriod(when, period)) return false;
      if (!q) return true;
      const num = String(o.orderNumber);
      const name = (o.customerName || '').toLowerCase();
      return num.includes(q) || name.includes(q);
    });

    list = [...list].sort((a, b) => {
      const ta = new Date(a.finalizedAt || a.deliveredAt || a.createdAt).getTime();
      const tb = new Date(b.finalizedAt || b.deliveredAt || b.createdAt).getTime();
      const va = parseFloat(a.total || '0');
      const vb = parseFloat(b.total || '0');
      if (sort === 'newest') return tb - ta;
      if (sort === 'oldest') return ta - tb;
      if (sort === 'highest') return vb - va;
      return va - vb;
    });
    return list;
  }, [orders, query, period, sort]);

  const stats = useMemo(() => {
    const qty = filtered.length;
    const total = filtered.reduce((s, o) => s + parseFloat(o.total || '0'), 0);
    const ticket = qty > 0 ? total / qty : 0;
    return { qty, total, ticket };
  }, [filtered]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/pedidos" className="p-2 text-zinc-400 hover:text-white" title="Voltar aos pedidos">
              <ArrowLeft size={20} />
            </Link>
            <div className="min-w-0">
              <h1 className="text-white font-black uppercase text-base leading-none flex items-center gap-2">
                <PackageCheck size={18} className="text-violet-400" /> Pedidos Finalizados
              </h1>
              <p className="text-zinc-600 text-xs mt-1">Arquivo operacional — sem retorno ao fluxo</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => { await logout(); setLocation('/'); }}
            className="p-2 text-zinc-400 hover:text-red-400"
            title="Sair"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1">
              <Receipt size={12} /> Quantidade
            </p>
            <p className="text-white font-black text-xl mt-1">{stats.qty}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1">
              <TrendingUp size={12} /> Total vendido
            </p>
            <p className="text-amber-400 font-black text-lg mt-1">{money(stats.total)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1">
              <Calculator size={12} /> Ticket médio
            </p>
            <p className="text-white font-black text-lg mt-1">{money(stats.ticket)}</p>
          </div>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou nº do pedido"
            className="w-full h-11 pl-10 pr-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm focus:border-violet-500 outline-none"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                period === p.key
                  ? 'bg-violet-500 text-white'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-zinc-500 text-xs uppercase font-bold">Ordenar</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-10 flex-1 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm px-3"
          >
            <option value="newest">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
            <option value="highest">Maior valor</option>
            <option value="lowest">Menor valor</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm text-center py-10">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-zinc-600 text-sm text-center py-16">Nenhum pedido finalizado neste filtro.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((o) => {
              const when = o.finalizedAt || o.deliveredAt || o.createdAt;
              const prepSec = o.prepDurationSeconds
                ?? (o.prepStartedAt && o.prepFinishedAt
                  ? Math.max(0, Math.round((new Date(o.prepFinishedAt).getTime() - new Date(o.prepStartedAt).getTime()) / 1000))
                  : null);
              return (
                <article key={o.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-white font-black text-base">#{o.orderNumber}</p>
                      <p className="text-zinc-300 text-sm font-bold">{o.customerName}</p>
                      <p className="text-zinc-500 text-xs">{o.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-amber-400 font-black">{money(o.total)}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-300 mt-1">
                        {WORKFLOW_LABELS.finalized}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-zinc-600 uppercase font-bold text-[10px]">Data</p>
                      <p className="text-zinc-300">{formatDate(when)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-600 uppercase font-bold text-[10px]">Hora</p>
                      <p className="text-zinc-300">{formatTime(when)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-600 uppercase font-bold text-[10px]">Pagamento</p>
                      <p className="text-zinc-300">{formatPaymentMethod(o)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-600 uppercase font-bold text-[10px]">Tempo de preparo</p>
                      <p className="text-zinc-300">{prepSec != null ? formatPrepDuration(prepSec) : '—'}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-zinc-600 uppercase font-bold text-[10px]">Endereço</p>
                    <p className="text-zinc-300 text-sm leading-relaxed">{addressLine(o)}</p>
                  </div>

                  <div>
                    <p className="text-zinc-600 uppercase font-bold text-[10px] mb-1">Produtos</p>
                    <ul className="space-y-1">
                      {(o.items || []).map((it) => (
                        <li key={it.id} className="text-zinc-300 text-sm">
                          {it.quantity}x {it.productName}
                          {it.addons?.length ? (
                            <span className="text-zinc-500"> ({it.addons.map((a) => a.name).join(', ')})</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {o.notes ? (
                    <div>
                      <p className="text-zinc-600 uppercase font-bold text-[10px]">Observações</p>
                      <p className="text-zinc-400 text-sm">{o.notes}</p>
                    </div>
                  ) : null}

                  <p className="text-[11px] text-zinc-600">
                    Status: Finalizado — processo encerrado (sem retorno ao fluxo operacional).
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
        <div className="max-w-3xl mx-auto flex overflow-x-auto no-scrollbar">
          <Link href="/admin/pedidos" className="flex-1 min-w-[64px]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-zinc-500 hover:text-white">
              <LayoutDashboard size={18} />
              <span className="text-[9px] font-bold uppercase">Pedidos</span>
            </div>
          </Link>
          <Link href="/admin/pedidos-finalizados" className="flex-1 min-w-[64px]">
            <div className="flex flex-col items-center gap-0.5 py-2.5 text-violet-400">
              <PackageCheck size={18} />
              <span className="text-[9px] font-bold uppercase">Finalizados</span>
            </div>
          </Link>
        </div>
      </nav>
    </div>
  );
}
