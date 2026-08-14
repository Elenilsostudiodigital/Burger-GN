import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Flame, LogOut, Search, Loader2, MessageCircle, X, Check, Crown, AlertTriangle,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  getRecoveryClients, registerRecoveryContact, openRecoveryWhatsapp, buildRecoveryMessage,
  daysSinceIso, getAdminCoupons,
  ClubClient, RecoveryFilter, RecoverySummary, Coupon,
} from '../../lib/api';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import { ClientsSubnav } from '../../components/ClientsSubnav';
import { AdminTab, AdminTabBar } from '../../components/AdminTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FILTERS: { id: RecoveryFilter; label: string; emoji: string }[] = [
  { id: 'todos', label: 'Todos', emoji: '🔥' },
  { id: 'esfriando', label: 'Esfriando', emoji: '🟡' },
  { id: 'em_risco', label: 'Em risco', emoji: '🟠' },
  { id: 'perdido', label: 'Perdidos', emoji: '🔴' },
  { id: 'vip_inativo', label: 'VIPs inativos', emoji: '👑' },
];

function fmtMoney(v: number) {
  return `R$ ${(Number.isFinite(v) ? v : 0).toFixed(2).replace('.', ',')}`;
}

function formatPhone(v: string) {
  const n = v.replace(/\D/g, '');
  if (n.length === 13 && n.startsWith('55')) {
    return `+55 (${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
  }
  return v;
}

function formatDate(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function statusBadge(c: ClubClient) {
  if (c.vipInativo) {
    return { text: 'VIP inativo', className: 'text-amber-300 bg-amber-500/15 border-amber-500/30' };
  }
  switch (c.recoveryStatus) {
    case 'esfriando':
      return { text: 'Esfriando', className: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/30' };
    case 'em_risco':
      return { text: 'Em risco', className: 'text-orange-300 bg-orange-500/15 border-orange-500/30' };
    case 'perdido':
      return { text: 'Perdido', className: 'text-red-300 bg-red-500/15 border-red-500/30' };
    default:
      return { text: 'Ativo', className: 'text-green-300 bg-green-500/15 border-green-500/30' };
  }
}

const EMPTY_SUMMARY: RecoverySummary = {
  total: 0, esfriando: 0, emRisco: 0, perdidos: 0, vipsInativos: 0, historicalRevenue: 0,
};

export default function ClientsRecovery() {
  const { logout } = useAdmin();
  const [, setLocation] = useLocation();
  const [clients, setClients] = useState<ClubClient[]>([]);
  const [summary, setSummary] = useState<RecoverySummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<RecoveryFilter>('todos');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const [modal, setModal] = useState<ClubClient | null>(null);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [includeCoupon, setIncludeCoupon] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await getRecoveryClients({ q: q.trim() || undefined, status: filter });
      setClients(data.clients);
      setSummary(data.summary);
    } catch {
      setError('Erro ao carregar recuperação de clientes');
      setClients([]);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [q, filter]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    getAdminCoupons()
      .then((list) => setCoupons(list.filter((c) => c.active)))
      .catch(() => setCoupons([]));
  }, []);

  const activeCoupons = useMemo(() => coupons, [coupons]);

  const openModal = (c: ClubClient) => {
    const code = includeCoupon ? couponCode : '';
    setModal(c);
    setMessage(buildRecoveryMessage(c, code || null));
    setEditing(false);
    setIncludeCoupon(false);
    setCouponCode(activeCoupons[0]?.code || '');
  };

  useEffect(() => {
    if (!modal) return;
    if (!editing) {
      setMessage(buildRecoveryMessage(modal, includeCoupon ? couponCode : null));
    }
  }, [includeCoupon, couponCode, modal, editing]);

  const recentWarning = (c: ClubClient | null) => {
    if (!c?.lastRecoveryAt) return null;
    const days = daysSinceIso(c.lastRecoveryAt);
    if (days === null || days > 7) return null;
    if (days <= 0) return 'Contato de recuperação iniciado hoje.';
    return `Contato de recuperação iniciado há ${days} dia${days === 1 ? '' : 's'}.`;
  };

  const handleOpenWhatsapp = async () => {
    if (!modal || !message.trim()) return;
    setBusy(true); setError('');
    try {
      const warn = recentWarning(modal);
      // Soft alert only — never block
      if (warn) {
        // keep visible in modal; proceed
      }
      const res = await registerRecoveryContact(modal.id, {
        message: message.trim(),
        couponCode: includeCoupon && couponCode ? couponCode : null,
      });
      const opened = openRecoveryWhatsapp(modal.phone, message.trim());
      if (!opened) {
        setError('Não foi possível abrir o WhatsApp. Verifique o telefone.');
      } else {
        setToast(`Contato iniciado com ${modal.name}`);
        setTimeout(() => setToast(''), 2800);
      }
      if (res.warning) {
        // previous contact warning already shown; keep toast for success
      }
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar contato');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3">
        <div className="admin-shell flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Flame size={20} className="text-orange-400" />
            <div>
              <h1 className="text-white font-black uppercase text-base leading-none">Recuperação</h1>
              <p className="text-zinc-600 text-xs">Contato manual via WhatsApp</p>
            </div>
          </div>
          <button type="button" onClick={async () => { await logout(); setLocation('/'); }}
            className="p-2 text-zinc-400 hover:text-red-400">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="admin-shell px-4 py-5 space-y-4">
        <ClientsSubnav active="recuperacao" />

        {/* Summary */}
        <section className="rounded-2xl border border-orange-500/20 bg-gradient-to-b from-orange-500/10 to-zinc-900 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-orange-400" />
            <h2 className="text-white font-black uppercase text-sm">Clientes para recuperar</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SummaryChip emoji="🔥" label="Todos" value={summary.total} />
            <SummaryChip emoji="🟡" label="Esfriando" value={summary.esfriando} />
            <SummaryChip emoji="🟠" label="Em risco" value={summary.emRisco} />
            <SummaryChip emoji="🔴" label="Perdidos" value={summary.perdidos} />
            <SummaryChip emoji="👑" label="VIPs inativos" value={summary.vipsInativos} wide />
          </div>
          <p className="text-zinc-400 text-xs leading-relaxed">
            {fmtMoney(summary.historicalRevenue)} em faturamento histórico desses clientes
          </p>
        </section>

        <div className="space-y-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou WhatsApp…"
              className="w-full h-12 rounded-xl bg-zinc-900 border border-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <AdminTabBar>
            {FILTERS.map((f) => (
              <AdminTab
                key={f.id}
                active={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.emoji} {f.label}
              </AdminTab>
            ))}
          </AdminTabBar>
        </div>

        {toast && (
          <p className="text-green-400 text-sm flex items-center gap-2">
            <Check size={14} /> {toast}
          </p>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber-500" size={28} /></div>
        ) : clients.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-zinc-500 text-sm">Nenhum cliente neste filtro.</p>
            <Link href="/admin/clientes" className="text-amber-500 text-xs font-bold uppercase">
              Ver lista de clientes
            </Link>
          </div>
        ) : (
          <div className="admin-card-grid-2">
            {clients.map((c) => {
              const badge = statusBadge(c);
              const warn = recentWarning(c);
              return (
                <article key={c.id} className="admin-card rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white font-bold text-base truncate flex items-center gap-1.5">
                        {c.vipInativo && <Crown size={14} className="text-amber-400 shrink-0" />}
                        {c.name}
                      </p>
                      <p className="text-zinc-400 text-xs font-mono">{formatPhone(c.phone)}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-full border ${badge.className}`}>
                      {badge.text}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Info label="Último pedido" value={formatDate(c.lastOrderAt)} />
                    <Info
                      label="Dias sem comprar"
                      value={c.daysWithoutOrder == null ? 'Sem pedidos' : `${c.daysWithoutOrder}d`}
                    />
                    <Info label="Pedidos" value={String(c.orderCount)} />
                    <Info label="Total gasto" value={fmtMoney(c.totalSpent)} />
                    <Info label="Selos" value={String(c.stamps)} />
                    <Info
                      label="Cashback"
                      value={fmtMoney(parseFloat(c.cashbackBalance) || 0)}
                    />
                  </div>

                  <p className="text-zinc-500 text-[11px]">
                    Último contato:{' '}
                    <span className="text-zinc-300 font-semibold">{formatDate(c.lastRecoveryAt)}</span>
                    {c.lastRecoveryCoupon ? ` · cupom ${c.lastRecoveryCoupon}` : ''}
                  </p>
                  {warn && (
                    <p className="text-orange-300 text-[11px] flex items-start gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2.5 py-2">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      {warn}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => openModal(c)}
                    className="w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-black text-sm uppercase flex items-center justify-center gap-2 shadow-lg shadow-green-900/30"
                  >
                    <MessageCircle size={18} />
                    Recuperar no WhatsApp
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-3" onClick={() => !busy && setModal(null)}>
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-white font-black uppercase text-sm">Recuperar cliente</h2>
                <p className="text-zinc-500 text-xs mt-0.5">{modal.name} · {formatPhone(modal.phone)}</p>
              </div>
              <button type="button" disabled={busy} onClick={() => setModal(null)} className="text-zinc-500">
                <X size={18} />
              </button>
            </div>

            {recentWarning(modal) && (
              <p className="text-orange-300 text-xs flex items-start gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {recentWarning(modal)} Você ainda pode continuar.
              </p>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-zinc-400 text-xs">Mensagem</Label>
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="text-amber-500 text-[11px] font-bold uppercase"
                >
                  {editing ? 'Usar modelo' : 'Editar mensagem'}
                </button>
              </div>
              <textarea
                value={message}
                onChange={(e) => { setEditing(true); setMessage(e.target.value); }}
                rows={7}
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm p-3 focus:border-amber-500 focus:outline-none resize-none leading-relaxed"
              />
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCoupon}
                onChange={(e) => {
                  setIncludeCoupon(e.target.checked);
                  setEditing(false);
                }}
                className="mt-1 accent-amber-500"
              />
              <span className="min-w-0">
                <span className="text-white text-sm font-bold block">Incluir cupom de recuperação</span>
                <span className="text-zinc-500 text-xs">
                  Usa um cupom já cadastrado no sistema. A mensagem não envia sozinha.
                </span>
              </span>
            </label>

            {includeCoupon && (
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Cupom</Label>
                {activeCoupons.length === 0 ? (
                  <p className="text-zinc-500 text-xs">
                    Nenhum cupom ativo. Cadastre em Admin → Cupons.
                  </p>
                ) : (
                  <select
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value); setEditing(false); }}
                    className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm px-3"
                  >
                    {activeCoupons.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code}
                        {c.discountType === 'percentage'
                          ? ` — ${c.discountValue}% OFF`
                          : ` — R$ ${parseFloat(String(c.discountValue)).toFixed(2)} OFF`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <p className="text-zinc-600 text-[11px] leading-relaxed">
              O WhatsApp abrirá com a mensagem pronta. Você precisa apertar <strong className="text-zinc-400">Enviar</strong> manualmente.
              Registramos apenas &quot;Contato iniciado&quot; — sem confirmação de entrega.
            </p>

            <Button
              onClick={() => void handleOpenWhatsapp()}
              disabled={busy || !message.trim()}
              className="w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-black uppercase"
            >
              {busy ? <Loader2 className="animate-spin" size={18} /> : <MessageCircle size={18} className="mr-2" />}
              Abrir WhatsApp
            </Button>
          </div>
        </div>
      )}

      <AdminBottomNav active="/admin/clientes" />
    </div>
  );
}

function SummaryChip({
  emoji, label, value, wide,
}: { emoji: string; label: string; value: number; wide?: boolean }) {
  return (
    <div className={`rounded-xl bg-zinc-950/70 border border-zinc-800 px-3 py-2 ${wide ? 'col-span-2' : ''}`}>
      <p className="text-zinc-500 text-[10px] font-bold uppercase">{emoji} {label}</p>
      <p className="text-white font-black text-xl leading-none mt-1">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-2">
      <p className="text-zinc-600 text-[10px] font-bold uppercase">{label}</p>
      <p className="text-zinc-200 font-semibold mt-0.5">{value}</p>
    </div>
  );
}
