import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { getFinancialReport, FinancialReport, PAYMENT_METHOD_LABELS } from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import {
  LayoutDashboard, UtensilsCrossed, Tag, MapPin, Navigation, Settings,
  LogOut, Upload, TrendingUp, Wallet, ShoppingBag, CheckCircle2, XCircle,
  Clock, Users, UserPlus, Repeat, Truck, Star, Crown, FileDown, FileSpreadsheet,
  Loader2, DollarSign, Wallet2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminTab, AdminTabBar } from '../../components/AdminTabs';

function AdminNav({ active }: { active: string }) {
  const items = [
    { href: '/admin', icon: <TrendingUp size={17} />, label: 'Início' },
    { href: '/admin/pedidos', icon: <LayoutDashboard size={17} />, label: 'Pedidos' },
    { href: '/admin/cardapio', icon: <UtensilsCrossed size={17} />, label: 'Cardápio' },
    { href: '/admin/financeiro', icon: <TrendingUp size={17} />, label: 'Financeiro' },
    { href: '/admin/cupons', icon: <Tag size={17} />, label: 'Cupons' },
    { href: '/admin/clube', icon: <Crown size={17} />, label: 'Clube Burger' },
    { href: '/admin/taxas', icon: <MapPin size={17} />, label: 'Bairros' },
    { href: '/admin/entrega-km', icon: <Navigation size={17} />, label: 'Por KM' },
    { href: '/admin/config', icon: <Settings size={17} />, label: 'Config' },
    { href: '/admin/importar', icon: <Upload size={17} />, label: 'Importar' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40 overflow-x-auto no-scrollbar">
      <div className="admin-shell flex min-w-max">
        {items.map(item => (
          <Link key={item.href} href={item.href} className="flex-1 min-w-[12%]">
            <div className={`flex flex-col items-center gap-0.5 py-2.5 px-2 transition-colors ${active === item.href ? 'text-amber-500' : 'text-zinc-500 hover:text-white'}`}>
              {item.icon}
              <span className="text-[9px] font-bold uppercase whitespace-nowrap">{item.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </nav>
  );
}

const PRESETS = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'year', label: 'Este ano' },
] as const;

type PresetKey = typeof PRESETS[number]['key'];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  const to = toISODate(now);
  if (key === '7d') {
    const from = new Date(now); from.setDate(from.getDate() - 6);
    return { from: toISODate(from), to };
  }
  if (key === '30d') {
    const from = new Date(now); from.setDate(from.getDate() - 29);
    return { from: toISODate(from), to };
  }
  if (key === 'month') {
    return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  }
  return { from: toISODate(new Date(now.getFullYear(), 0, 1)), to };
}

function money(v: number): string {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

const CHART_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#a855f7', '#ec4899'];

type ChartTab = 'daily' | 'weekly' | 'monthly' | 'yearly';
const CHART_TABS: Array<{ key: ChartTab; label: string }> = [
  { key: 'daily', label: 'Dia' },
  { key: 'weekly', label: 'Semana' },
  { key: 'monthly', label: 'Mês' },
  { key: 'yearly', label: 'Ano' },
];

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-zinc-500 mb-1.5">
        {icon}
        <p className="text-[10px] uppercase tracking-wider font-bold">{label}</p>
      </div>
      <p className={`text-xl font-black ${accent ?? 'text-white'}`}>{value}</p>
    </div>
  );
}

export default function Financial() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState<PresetKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [chartTab, setChartTab] = useState<ChartTab>('daily');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const isValidIsoDate = (v: string) => ISO_DATE.test(v) && !isNaN(new Date(v).getTime()) && new Date(v).getFullYear() >= 2000 && new Date(v).getFullYear() <= 2100;

  const range = useMemo(() => {
    if (isValidIsoDate(customFrom) && isValidIsoDate(customTo)) return { from: customFrom, to: customTo };
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  const requestIdRef = React.useRef(0);

  const load = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true); setError('');
    try {
      const r = await getFinancialReport(range.from, range.to);
      if (requestIdRef.current !== requestId) return;
      setReport(r);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setError('Erro ao carregar relatório financeiro');
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  };

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const handleLogout = async () => { await logout(); setLocation('/'); };

  const handlePreset = (key: PresetKey) => { setPreset(key); setCustomFrom(''); setCustomTo(''); };

  const chartData = report?.charts[chartTab] ?? [];
  const paymentChartData = report
    ? (Object.entries(report.paymentMethods) as Array<[keyof typeof report.paymentMethods, { revenue: number; count: number }]>)
        .filter(([, v]) => v.revenue > 0 || v.count > 0)
        .map(([method, v]) => ({ name: PAYMENT_METHOD_LABELS[method], value: v.revenue, count: v.count }))
    : [];

  const handleExportExcel = () => {
    if (!report) return;
    setExporting('excel');
    try {
      const wb = XLSX.utils.book_new();

      const summary = [
        ['Relatório Financeiro — The Burger GN'],
        [`Período: ${range.from} a ${range.to}`],
        [],
        ['Faturamento de hoje', report.fixedRevenue.today],
        ['Faturamento da semana', report.fixedRevenue.week],
        ['Faturamento do mês', report.fixedRevenue.month],
        ['Faturamento do ano', report.fixedRevenue.year],
        [],
        ['Total de pedidos (período)', report.totals.totalOrders],
        ['Pedidos entregues', report.totals.deliveredOrders],
        ['Pedidos cancelados', report.totals.cancelledOrders],
        ['Pedidos pendentes', report.totals.pendingOrders],
        [],
        ['Faturamento do período', report.revenue],
        ['Ticket médio', report.averageTicket],
        ['Total arrecadado com taxa de entrega', report.totalDeliveryFees],
        [],
        ['Produto mais vendido', report.topProduct?.name ?? '-', report.topProduct?.quantity ?? 0],
        ['Categoria mais vendida', report.topCategory?.name ?? '-', report.topCategory?.quantity ?? 0],
        ['Cliente que mais comprou', report.topCustomer?.name ?? '-', report.topCustomer?.total ?? 0],
        [],
        ['Clientes novos', report.customers.new],
        ['Clientes recorrentes', report.customers.returning],
        [],
        ['Formas de pagamento', 'Faturamento', 'Qtd. pedidos'],
        ['Pix', report.paymentMethods.pix.revenue, report.paymentMethods.pix.count],
        ['Dinheiro', report.paymentMethods.cash.revenue, report.paymentMethods.cash.count],
        ['Cartão', report.paymentMethods.card.revenue, report.paymentMethods.card.count],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summary);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumo');

      const salesRows = [['Data', 'Faturamento', 'Pedidos'], ...chartData.map(p => [p.label, p.total, p.orders])];
      const salesSheet = XLSX.utils.aoa_to_sheet(salesRows);
      XLSX.utils.book_append_sheet(wb, salesSheet, 'Vendas');

      XLSX.writeFile(wb, `financeiro-burger-gn-${range.from}-a-${range.to}.xlsx`);
    } finally {
      setExporting(null);
    }
  };

  const handleExportPDF = () => {
    if (!report) return;
    setExporting('pdf');
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Relatório Financeiro — The Burger GN', 14, 16);
      doc.setFontSize(10);
      doc.text(`Período: ${range.from} a ${range.to}`, 14, 23);

      autoTable(doc, {
        startY: 28,
        head: [['Indicador', 'Valor']],
        body: [
          ['Faturamento de hoje', money(report.fixedRevenue.today)],
          ['Faturamento da semana', money(report.fixedRevenue.week)],
          ['Faturamento do mês', money(report.fixedRevenue.month)],
          ['Faturamento do ano', money(report.fixedRevenue.year)],
          ['Faturamento do período', money(report.revenue)],
          ['Total de pedidos', String(report.totals.totalOrders)],
          ['Pedidos entregues', String(report.totals.deliveredOrders)],
          ['Pedidos cancelados', String(report.totals.cancelledOrders)],
          ['Pedidos pendentes', String(report.totals.pendingOrders)],
          ['Ticket médio', money(report.averageTicket)],
          ['Taxa de entrega arrecadada', money(report.totalDeliveryFees)],
          ['Produto mais vendido', report.topProduct ? `${report.topProduct.name} (${report.topProduct.quantity}x)` : '-'],
          ['Categoria mais vendida', report.topCategory ? `${report.topCategory.name} (${report.topCategory.quantity}x)` : '-'],
          ['Cliente que mais comprou', report.topCustomer ? `${report.topCustomer.name} — ${money(report.topCustomer.total)}` : '-'],
          ['Clientes novos', String(report.customers.new)],
          ['Clientes recorrentes', String(report.customers.returning)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [245, 158, 11] },
      });

      const afterSummaryY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      autoTable(doc, {
        startY: afterSummaryY,
        head: [['Forma de Pagamento', 'Faturamento', 'Qtd. Pedidos']],
        body: [
          ['Pix', money(report.paymentMethods.pix.revenue), String(report.paymentMethods.pix.count)],
          ['Dinheiro', money(report.paymentMethods.cash.revenue), String(report.paymentMethods.cash.count)],
          ['Cartão', money(report.paymentMethods.card.revenue), String(report.paymentMethods.card.count)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [245, 158, 11] },
      });

      const afterPaymentsY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      autoTable(doc, {
        startY: afterPaymentsY,
        head: [['Data', 'Faturamento', 'Pedidos']],
        body: chartData.map(p => [p.label, money(p.total), String(p.orders)]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [245, 158, 11] },
      });

      doc.save(`financeiro-burger-gn-${range.from}-a-${range.to}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="admin-shell flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp size={20} className="text-amber-500" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Financeiro</h1>
              <p className="text-zinc-600 text-xs">The Burger GN</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-zinc-400 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="admin-shell px-4 py-5 space-y-5">
        {/* Fixed revenue cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Wallet size={14} />} label="Hoje" value={report ? money(report.fixedRevenue.today) : '—'} accent="text-amber-500" />
          <StatCard icon={<Wallet size={14} />} label="Semana" value={report ? money(report.fixedRevenue.week) : '—'} accent="text-amber-500" />
          <StatCard icon={<Wallet size={14} />} label="Mês" value={report ? money(report.fixedRevenue.month) : '—'} accent="text-amber-500" />
          <StatCard icon={<Wallet size={14} />} label="Ano" value={report ? money(report.fixedRevenue.year) : '—'} accent="text-amber-500" />
        </div>

        {/* Period filter */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <p className="text-zinc-400 text-xs uppercase font-bold">Filtro de período (aplica ao relatório abaixo)</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => handlePreset(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${preset === p.key && !customFrom ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-zinc-500 text-xs">De</Label>
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-white h-9 text-sm w-[150px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-500 text-xs">Até</Label>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-white h-9 text-sm w-[150px]" />
            </div>
            <p className="text-zinc-600 text-xs pb-2">{range.from} até {range.to}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : error ? (
          <p className="text-red-400 text-sm text-center py-8">{error}</p>
        ) : report ? (
          <>
            {/* Orders overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={<ShoppingBag size={14} />} label="Total pedidos" value={String(report.totals.totalOrders)} />
              <StatCard icon={<CheckCircle2 size={14} />} label="Entregues" value={String(report.totals.deliveredOrders)} accent="text-green-400" />
              <StatCard icon={<XCircle size={14} />} label="Cancelados" value={String(report.totals.cancelledOrders)} accent="text-red-400" />
              <StatCard icon={<Clock size={14} />} label="Pendentes" value={String(report.totals.pendingOrders)} accent="text-blue-400" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard icon={<DollarSign size={14} />} label="Faturamento (período)" value={money(report.revenue)} accent="text-amber-500" />
              <StatCard icon={<Wallet2 size={14} />} label="Ticket médio" value={money(report.averageTicket)} />
              <StatCard icon={<Truck size={14} />} label="Taxa de entrega arrecadada" value={money(report.totalDeliveryFees)} />
            </div>

            {/* Top rankings */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 mb-1.5"><Star size={14} /><p className="text-[10px] uppercase tracking-wider font-bold">Produto mais vendido</p></div>
                <p className="text-white font-bold text-sm">{report.topProduct?.name ?? 'Sem dados'}</p>
                {report.topProduct && <p className="text-zinc-500 text-xs mt-0.5">{report.topProduct.quantity} unidades</p>}
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 mb-1.5"><Star size={14} /><p className="text-[10px] uppercase tracking-wider font-bold">Categoria mais vendida</p></div>
                <p className="text-white font-bold text-sm">{report.topCategory?.name ?? 'Sem dados'}</p>
                {report.topCategory && <p className="text-zinc-500 text-xs mt-0.5">{report.topCategory.quantity} unidades</p>}
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 mb-1.5"><Crown size={14} /><p className="text-[10px] uppercase tracking-wider font-bold">Cliente que mais comprou</p></div>
                <p className="text-white font-bold text-sm">{report.topCustomer?.name ?? 'Sem dados'}</p>
                {report.topCustomer && <p className="text-zinc-500 text-xs mt-0.5">{money(report.topCustomer.total)} em {report.topCustomer.orderCount} pedidos</p>}
              </div>
            </div>

            {/* New vs returning customers */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={<UserPlus size={14} />} label="Clientes novos" value={String(report.customers.new)} accent="text-green-400" />
              <StatCard icon={<Repeat size={14} />} label="Clientes recorrentes" value={String(report.customers.returning)} accent="text-blue-400" />
            </div>

            {/* Payment methods */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-3"><Users size={14} /><p className="text-xs uppercase font-bold">Formas de pagamento</p></div>
              {paymentChartData.length === 0 ? (
                <p className="text-zinc-600 text-sm">Sem dados no período</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-full sm:w-1/2 h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={paymentChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                          {paymentChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, color: '#fff' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 w-full space-y-2">
                    {paymentChartData.map((p, i) => (
                      <div key={p.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-zinc-300"><span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{p.name}</span>
                        <span className="text-white font-bold">{money(p.value)} <span className="text-zinc-500 font-normal">({p.count})</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sales chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="space-y-3 mb-3">
                <p className="text-zinc-400 text-xs uppercase font-bold">Vendas</p>
                <AdminTabBar>
                  {CHART_TABS.map(t => (
                    <AdminTab key={t.key} active={chartTab === t.key} onClick={() => setChartTab(t.key)}>
                      {t.label}
                    </AdminTab>
                  ))}
                </AdminTabBar>
              </div>
              {chartData.length === 0 ? (
                <p className="text-zinc-600 text-sm py-8 text-center">Sem dados para o período selecionado</p>
              ) : (
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, color: '#fff' }} />
                      <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Export buttons */}
            <div className="flex gap-3">
              <Button onClick={handleExportPDF} disabled={exporting !== null}
                className="flex-1 h-11 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                {exporting === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} Exportar PDF
              </Button>
              <Button onClick={handleExportExcel} disabled={exporting !== null}
                className="flex-1 h-11 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                {exporting === 'excel' ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Exportar Excel
              </Button>
            </div>
          </>
        ) : null}
      </main>

      <AdminNav active="/admin/financeiro" />
    </div>
  );
}
