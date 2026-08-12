import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  getSalesDashboard, SalesDashboardReport, SalesPeriodPreset,
  PAYMENT_METHOD_LABELS, ORDER_TYPE_LABELS,
} from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import { useStore } from '../../context/StoreContext';
import { StoreBrandMark } from '../../components/StoreBrand';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import {
  LogOut, Loader2, TrendingUp, TrendingDown, Minus,
  ShoppingBag, Wallet, Users, Receipt, Package, CreditCard,
  Bike, Clock, CalendarDays, Star, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PRESETS: { key: SalesPeriodPreset; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'custom', label: 'Personalizado' },
];

function money(v: number): string {
  return `R$ ${(Number.isFinite(v) ? v : 0).toFixed(2).replace('.', ',')}`;
}

function formatDayBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function kpiTitle(preset: SalesPeriodPreset, base: string): string {
  if (preset === 'today') return `${base} hoje`;
  if (preset === 'yesterday') return `${base} ontem`;
  return base;
}

function ChangeBadge({
  changePercent,
  comparisonLabel,
}: {
  changePercent: number | null;
  comparisonLabel: string;
}) {
  if (changePercent === null) {
    return (
      <p className="text-[11px] text-zinc-500 mt-1.5 leading-snug">
        Sem base no período anterior
      </p>
    );
  }
  if (changePercent === 0) {
    return (
      <p className="text-[11px] text-zinc-400 mt-1.5 flex items-center gap-1">
        <Minus size={12} /> 0% {comparisonLabel}
      </p>
    );
  }
  const up = changePercent > 0;
  return (
    <p className={`text-[11px] mt-1.5 flex items-center gap-1 font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '↑' : '↓'} {Math.abs(changePercent).toFixed(1).replace('.', ',')}% {comparisonLabel}
    </p>
  );
}

function KpiCard({
  icon,
  label,
  value,
  changePercent,
  comparisonLabel,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  changePercent: number | null;
  comparisonLabel: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 min-h-[118px]">
      <div className="flex items-center gap-2 text-zinc-500 mb-2">
        <span className={accent}>{icon}</span>
        <p className="text-[10px] uppercase tracking-wider font-bold">{label}</p>
      </div>
      <p className={`text-2xl font-black leading-none ${accent}`}>{value}</p>
      <ChangeBadge changePercent={changePercent} comparisonLabel={comparisonLabel} />
    </div>
  );
}

function formatChartLabel(label: string, granularity: string): string {
  if (granularity === 'hour') return label;
  if (granularity === 'month') {
    const [y, m] = label.split('-');
    return m && y ? `${m}/${y.slice(2)}` : label;
  }
  const [, m, d] = label.split('-');
  return m && d ? `${d}/${m}` : label;
}

export default function SalesDashboard() {
  const { logout } = useAdmin();
  const { store } = useStore();
  const [, setLocation] = useLocation();
  const [preset, setPreset] = useState<SalesPeriodPreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [report, setReport] = useState<SalesDashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const query = useMemo(() => {
    if (preset === 'custom') {
      return { preset: 'custom' as const, from: customFrom, to: customTo };
    }
    return { preset };
  }, [preset, customFrom, customTo]);

  const canLoad = preset !== 'custom' || (/^\d{4}-\d{2}-\d{2}$/.test(customFrom) && /^\d{4}-\d{2}-\d{2}$/.test(customTo));

  const load = async () => {
    if (!canLoad) return;
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const data = await getSalesDashboard(query);
      if (requestId.current !== id) return;
      setReport(data);
    } catch {
      if (requestId.current !== id) return;
      setError('Não foi possível carregar o dashboard de vendas.');
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.preset, query.from, query.to, canLoad]);

  const chartData = useMemo(() => {
    if (!report) return [];
    return report.chart.series.map((p) => ({
      ...p,
      display: formatChartLabel(p.label, report.chart.granularity),
    }));
  }, [report]);

  const chartTitle =
    report?.chart.granularity === 'hour'
      ? 'Vendas por hora'
      : report?.chart.granularity === 'month'
        ? 'Vendas por mês'
        : 'Vendas por dia';

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <StoreBrandMark size={36} />
            <div className="min-w-0">
              <h1 className="text-white font-black uppercase text-base leading-none">Dashboard</h1>
              <p className="text-zinc-500 text-xs mt-0.5 truncate">Vendas · {store.storeName || 'The Burger GN'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={load}
              className="p-2 text-zinc-400 hover:text-amber-400"
              aria-label="Atualizar"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <Link
              href="/admin/pedidos"
              className="hidden sm:inline-flex h-9 items-center px-3 rounded-xl bg-amber-500 text-zinc-950 text-xs font-black uppercase"
            >
              Pedidos
            </Link>
            <button
              type="button"
              onClick={async () => { await logout(); setLocation('/'); }}
              className="p-2 text-zinc-400 hover:text-red-400"
              aria-label="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Period filters */}
        <section className="space-y-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={`shrink-0 h-9 px-3 rounded-xl text-[11px] font-bold uppercase tracking-wide ${
                  preset === p.key
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
              <div className="space-y-1">
                <Label className="text-zinc-500 text-[10px] uppercase font-bold">De</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-white h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-zinc-500 text-[10px] uppercase font-bold">Até</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-white h-10"
                />
              </div>
            </div>
          )}
          {report && (
            <p className="text-zinc-500 text-xs">
              Período: {formatDayBR(report.period.from)}
              {report.period.from !== report.period.to ? ` – ${formatDayBR(report.period.to)}` : ''}
            </p>
          )}
        </section>

        {error && (
          <div className="rounded-xl border border-red-900 bg-red-950/40 text-red-400 text-sm px-4 py-3">
            {error}
          </div>
        )}

        {loading && !report ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-amber-500" size={28} />
          </div>
        ) : report ? (
          <>
            {/* KPI cards */}
            <section className="grid grid-cols-2 gap-3">
              <KpiCard
                icon={<Wallet size={16} />}
                label={kpiTitle(report.period.preset, 'Faturamento')}
                value={money(report.kpis.revenue.value)}
                changePercent={report.kpis.revenue.changePercent}
                comparisonLabel={report.period.comparisonLabel}
                accent="text-amber-400"
              />
              <KpiCard
                icon={<ShoppingBag size={16} />}
                label={kpiTitle(report.period.preset, 'Pedidos')}
                value={String(report.kpis.orders.value)}
                changePercent={report.kpis.orders.changePercent}
                comparisonLabel={report.period.comparisonLabel}
                accent="text-sky-400"
              />
              <KpiCard
                icon={<Receipt size={16} />}
                label="Ticket médio"
                value={money(report.kpis.averageTicket.value)}
                changePercent={report.kpis.averageTicket.changePercent}
                comparisonLabel={report.period.comparisonLabel}
                accent="text-emerald-400"
              />
              <KpiCard
                icon={<Users size={16} />}
                label={kpiTitle(report.period.preset, 'Clientes')}
                value={String(report.kpis.uniqueCustomers.value)}
                changePercent={report.kpis.uniqueCustomers.changePercent}
                comparisonLabel={report.period.comparisonLabel}
                accent="text-violet-300"
              />
            </section>

            {/* Chart */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="text-white font-black uppercase text-sm mb-3">{chartTitle}</h2>
              {chartData.every((p) => p.total === 0) ? (
                <p className="text-zinc-600 text-sm py-10 text-center">Sem faturamento no período.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="display"
                        tick={{ fill: '#71717a', fontSize: 10 }}
                        interval="preserveStartEnd"
                        minTickGap={16}
                      />
                      <YAxis
                        tick={{ fill: '#71717a', fontSize: 10 }}
                        width={48}
                        tickFormatter={(v) => `${Math.round(Number(v))}`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#09090b',
                          border: '1px solid #27272a',
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [money(Number(value)), 'Faturamento']}
                        labelFormatter={(l) => String(l)}
                      />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#f59e0b"
                        fill="url(#salesFill)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* Orders + customers */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                <h2 className="text-white font-black uppercase text-sm">Pedidos</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Concluídos</span>
                    <span className="text-emerald-400 font-bold">{report.ordersBreakdown.completed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Em andamento</span>
                    <span className="text-amber-400 font-bold">{report.ordersBreakdown.inProgress}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Cancelados</span>
                    <span className="text-red-400 font-bold">{report.ordersBreakdown.cancelled}</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-800 flex justify-between">
                    <span className="text-zinc-400">Faturamento válido</span>
                    <span className="text-white font-black">{money(report.ordersBreakdown.validRevenue)}</span>
                  </div>
                  <p className="text-[10px] text-zinc-600">Cancelados não entram no faturamento.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                <h2 className="text-white font-black uppercase text-sm">Clientes</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Novos</span>
                    <span className="text-sky-400 font-bold">{report.customers.new}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Recorrentes</span>
                    <span className="text-amber-400 font-bold">{report.customers.returning}</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-800 flex justify-between">
                    <span className="text-zinc-400">Únicos (WhatsApp)</span>
                    <span className="text-white font-black">{report.customers.unique}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Top products */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <h2 className="text-white font-black uppercase text-sm flex items-center gap-2">
                <Package size={16} className="text-amber-500" /> Produtos mais vendidos
              </h2>
              {report.topProducts.length === 0 ? (
                <p className="text-zinc-600 text-sm py-6 text-center">Nenhuma venda concluída no período.</p>
              ) : (
                <ol className="space-y-2">
                  {report.topProducts.map((p) => (
                    <li
                      key={`${p.rank}-${p.name}`}
                      className="flex items-start justify-between gap-3 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-white text-sm font-bold truncate">
                          <span className="text-amber-500 mr-1.5">{p.rank}º</span>
                          {p.name}
                        </p>
                        <p className="text-zinc-500 text-xs">{p.quantity} vendas</p>
                      </div>
                      <p className="text-amber-400 font-black text-sm shrink-0">{money(p.revenue)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Payments */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <h2 className="text-white font-black uppercase text-sm flex items-center gap-2">
                <CreditCard size={16} className="text-amber-500" /> Formas de pagamento
              </h2>
              <div className="space-y-2">
                {(Object.keys(PAYMENT_METHOD_LABELS) as Array<keyof typeof PAYMENT_METHOD_LABELS>).map((key) => {
                  const row = report.paymentMethods[key];
                  return (
                    <div key={key} className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5">
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-zinc-300 font-bold">{PAYMENT_METHOD_LABELS[key]}</span>
                        <span className="text-white font-black">{money(row.revenue)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${Math.min(100, row.percent)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        {row.percent.toFixed(1).replace('.', ',')}% · {row.count} pedido{row.count === 1 ? '' : 's'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Order types */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <h2 className="text-white font-black uppercase text-sm flex items-center gap-2">
                <Bike size={16} className="text-amber-500" /> Tipo de pedido
              </h2>
              <div className="grid grid-cols-1 gap-2">
                {(Object.keys(ORDER_TYPE_LABELS) as Array<keyof typeof ORDER_TYPE_LABELS>).map((key) => {
                  const row = report.orderTypes[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3"
                    >
                      <div>
                        <p className="text-white text-sm font-bold">{ORDER_TYPE_LABELS[key]}</p>
                        <p className="text-zinc-500 text-xs">{row.count} pedidos · {row.doneCount} concluídos</p>
                      </div>
                      <p className="text-amber-400 font-black text-sm">{money(row.revenue)}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Performance */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <h2 className="text-white font-black uppercase text-sm">Desempenho</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1">
                    <Clock size={12} /> Horário de pico
                  </p>
                  <p className="text-white font-black text-lg mt-1">
                    {report.performance.peakHour?.hour ?? '—'}
                  </p>
                  <p className="text-zinc-500 text-xs">
                    {report.performance.peakHour
                      ? `${report.performance.peakHour.orders} pedidos`
                      : 'Sem dados'}
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1">
                    <CalendarDays size={12} /> Melhor dia
                  </p>
                  <p className="text-white font-black text-lg mt-1">
                    {formatDayBR(report.performance.bestDay?.day)}
                  </p>
                  <p className="text-zinc-500 text-xs">
                    {report.performance.bestDay
                      ? money(report.performance.bestDay.revenue)
                      : 'Sem dados'}
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1">
                    <Star size={12} /> Produto campeão
                  </p>
                  <p className="text-white font-black text-sm mt-1 truncate">
                    {report.performance.topProduct?.name ?? '—'}
                  </p>
                  <p className="text-zinc-500 text-xs">
                    {report.performance.topProduct
                      ? `${report.performance.topProduct.quantity} vendas`
                      : 'Sem dados'}
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-3">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold">Ticket médio</p>
                  <p className="text-emerald-400 font-black text-lg mt-1">
                    {money(report.performance.averageTicket)}
                  </p>
                  <p className="text-zinc-500 text-xs">
                    Média de {report.performance.avgItemsPerOrder.toFixed(1).replace('.', ',')} itens/pedido
                  </p>
                </div>
              </div>
            </section>

            <Link href="/admin/pedidos">
              <Button className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-2xl uppercase">
                Ir para pedidos
              </Button>
            </Link>
          </>
        ) : null}
      </main>

      <AdminBottomNav active="/admin" />
    </div>
  );
}
