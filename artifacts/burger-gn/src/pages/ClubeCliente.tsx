import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Loader2, LogOut, RefreshCw, Wallet, Gift, History, Info,
} from 'lucide-react';
import { PageTransition } from '../components/PageTransition';
import { BottomNav } from '../components/BottomNav';
import { ClubeRewardToast, ClubeRewardToastItem } from '../components/ClubeRewardToast';
import { Button } from '@/components/ui/button';
import {
  getPublicClubeInfo,
  getPublicClubeMe,
  PublicClubeMeResponse,
  PublicClubeRules,
  ClientLedgerType,
} from '../lib/api';
import {
  clearClubePhone,
  formatWhatsappDisplay,
  formatWhatsappInput,
  getSavedClubePhone,
  getSeenLedgerIds,
  markLedgerIdsSeen,
  saveClubePhone,
} from '../lib/clubeCliente';

const LEDGER_LABEL: Record<ClientLedgerType, string> = {
  selo_pedido: 'Selo conquistado',
  cashback_pedido: 'Cashback recebido',
  cashback_utilizado: 'Cashback utilizado',
  ajuste_selo: 'Ajuste de selos',
  ajuste_cashback: 'Ajuste de cashback',
  recompensa_disponivel: 'Recompensa disponível',
  recompensa_resgatada: 'Recompensa resgatada',
};

const ORDER_STATUS: Record<string, string> = {
  new: 'Novo',
  preparing: 'Em preparo',
  delivery: 'Em entrega',
  done: 'Concluído',
  cancelled: 'Cancelado',
};

function fmtMoney(v: string | number | null | undefined) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')}`;
}

function formatDateTime(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StampProgress({ stamps, goal }: { stamps: number; goal: number }) {
  const filled = Math.min(Math.max(0, stamps), goal);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 justify-center" aria-hidden>
        {Array.from({ length: goal }).map((_, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03, duration: 0.25 }}
            className={`text-lg leading-none ${i < filled ? '' : 'opacity-30 grayscale'}`}
          >
            {i < filled ? '🍔' : '⬜'}
          </motion.span>
        ))}
      </div>
      <p className="text-center text-zinc-400 text-xs font-bold uppercase tracking-wider">
        {filled} de {goal} selos
      </p>
      <div className="h-2 rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-600 to-amber-400"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.round((filled / Math.max(1, goal)) * 100))}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

export default function ClubeCliente() {
  const [phoneInput, setPhoneInput] = useState(() => {
    const saved = getSavedClubePhone();
    return saved ? formatWhatsappInput(saved.length > 11 && saved.startsWith('55') ? saved.slice(2) : saved) : '';
  });
  const [rules, setRules] = useState<PublicClubeRules | null>(null);
  const [data, setData] = useState<PublicClubeMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<ClubeRewardToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const emitRewardToasts = useCallback((payload: PublicClubeMeResponse) => {
    if (!payload.found || !payload.member || !payload.ledger?.length) return;
    const phone = payload.member.phone;
    const seen = getSeenLedgerIds(phone);
    const isFirstVisit = seen.size === 0;
    const rewardEntries = payload.ledger.filter(
      (e) => e.type === 'cashback_pedido' || e.type === 'selo_pedido',
    );
    const allIds = payload.ledger.map((e) => e.id);

    if (isFirstVisit) {
      markLedgerIdsSeen(phone, allIds);
      return;
    }

    const fresh = rewardEntries.filter((e) => !seen.has(e.id)).slice(0, 4);
    if (fresh.length === 0) {
      markLedgerIdsSeen(phone, allIds);
      return;
    }

    const nextToasts: ClubeRewardToastItem[] = fresh.map((e) => {
      if (e.type === 'cashback_pedido') {
        const amount = e.cashbackDelta != null ? fmtMoney(e.cashbackDelta) : '';
        return {
          id: `toast-${e.id}`,
          kind: 'cashback' as const,
          title: 'Cashback creditado!',
          subtitle: amount
            ? `${amount} adicionados ao seu saldo${e.orderNumber != null ? ` · Pedido #${e.orderNumber}` : ''}`
            : e.description || 'Novo cashback no Clube Burger GN',
        };
      }
      return {
        id: `toast-${e.id}`,
        kind: 'selo' as const,
        title: 'Novo selo conquistado!',
        subtitle:
          e.orderNumber != null
            ? `+1 selo do pedido #${e.orderNumber}`
            : e.description || 'Seu cartão de fidelidade avançou',
      };
    });

    setToasts((prev) => [...nextToasts, ...prev].slice(0, 4));
    markLedgerIdsSeen(phone, allIds);
  }, []);

  const lookup = useCallback(async (rawPhone: string, opts?: { silent?: boolean }) => {
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Informe um WhatsApp válido com DDD.');
      return;
    }
    if (!opts?.silent) setLookingUp(true);
    setError('');
    try {
      const result = await getPublicClubeMe(digits);
      setData(result);
      setRules(result.rules);
      saveClubePhone(digits);
      emitRewardToasts(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível consultar o Clube.');
    } finally {
      if (!opts?.silent) setLookingUp(false);
    }
  }, [emitRewardToasts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const info = await getPublicClubeInfo();
        if (!cancelled) setRules(info);
        const saved = getSavedClubePhone();
        if (saved && !cancelled) {
          await lookup(saved, { silent: true });
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar o Clube Burger GN.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [lookup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void lookup(phoneInput);
  };

  const handleLogout = () => {
    clearClubePhone();
    setData(null);
    setPhoneInput('');
    setToasts([]);
  };

  const member = data?.found ? data.member : null;
  const fidelity = data?.fidelity;
  const cashbackProgram = data?.cashbackProgram;
  const activeRules = data?.rules ?? rules;

  const historyItems = useMemo(() => data?.history ?? [], [data?.history]);
  const ledgerItems = useMemo(() => data?.ledger ?? [], [data?.ledger]);

  return (
    <PageTransition className="bg-[#0a0a0a]">
      <ClubeRewardToast items={toasts} onDismiss={dismissToast} />

      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800/80 px-4 py-3 backdrop-blur-md">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link href="/" className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div className="min-w-0">
              <p className="text-amber-500 text-[10px] font-bold uppercase tracking-[0.18em]">The Burger GN</p>
              <h1 className="text-white font-black uppercase tracking-tight text-sm truncate">
                🍔 Clube Burger GN
              </h1>
            </div>
          </div>
          {member ? (
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
              aria-label="Trocar WhatsApp"
            >
              <LogOut size={18} />
            </button>
          ) : null}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 pb-28 space-y-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {!member && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 space-y-4"
              >
                <div className="space-y-1.5">
                  <h2 className="text-white font-black text-xl tracking-tight">
                    {activeRules?.clubName || 'Clube Burger GN'}
                  </h2>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    {activeRules?.welcomeMessage ||
                      'Acumule cashback e selos automaticamente a cada pedido.'}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <label className="block space-y-1.5">
                    <span className="text-zinc-500 text-[11px] font-bold uppercase tracking-wider">
                      Seu WhatsApp
                    </span>
                    <input
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(formatWhatsappInput(e.target.value))}
                      placeholder="(71) 99999-9999"
                      inputMode="tel"
                      autoComplete="tel"
                      className="w-full h-12 rounded-xl bg-zinc-950 border border-zinc-800 px-4 text-white text-sm placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
                    />
                  </label>
                  {error ? <p className="text-red-400 text-xs">{error}</p> : null}
                  <Button
                    type="submit"
                    disabled={lookingUp}
                    className="w-full h-12 rounded-xl font-bold tracking-wider shadow-lg shadow-amber-500/15"
                  >
                    {lookingUp ? <Loader2 className="animate-spin" size={18} /> : 'Entrar no Clube'}
                  </Button>
                </form>
              </motion.section>
            )}

            <AnimatePresence mode="wait">
              {data && !data.found && (
                <motion.section
                  key="not-member"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-amber-500/25 bg-zinc-900/80 p-5 space-y-4 text-center"
                >
                  <div className="text-4xl">🍔</div>
                  <div className="space-y-2">
                    <h2 className="text-white font-black text-lg leading-snug">
                      Você ainda não participa do Clube Burger GN.
                    </h2>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                      Faça seu primeiro pedido e comece a acumular Cashback e Selos automaticamente.
                    </p>
                  </div>
                  <Link href="/cardapio">
                    <Button className="w-full h-12 rounded-xl font-bold tracking-wider">
                      🍔 Fazer meu primeiro pedido.
                    </Button>
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-zinc-500 text-xs font-bold uppercase tracking-wider hover:text-zinc-300"
                  >
                    Usar outro WhatsApp
                  </button>
                </motion.section>
              )}

              {member && fidelity && cashbackProgram && (
                <motion.div
                  key="member"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Bem-vindo(a)</p>
                        <h2 className="text-white font-black text-xl truncate">{member.name}</h2>
                        <p className="text-zinc-500 text-xs font-mono mt-0.5">
                          {formatWhatsappDisplay(member.phone)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void lookup(member.phone)}
                        className="p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
                        aria-label="Atualizar"
                      >
                        <RefreshCw size={16} className={lookingUp ? 'animate-spin' : ''} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5">
                        <p className="text-zinc-500 text-[10px] uppercase font-bold">💰 Cashback</p>
                        <p className="text-emerald-400 font-black text-xl leading-tight mt-0.5">
                          {fmtMoney(member.cashbackBalance)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5">
                        <p className="text-zinc-500 text-[10px] uppercase font-bold">🍔 Selos</p>
                        <p className="text-amber-400 font-black text-xl leading-tight mt-0.5">
                          {member.stamps}
                        </p>
                      </div>
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5">
                        <p className="text-zinc-500 text-[10px] uppercase font-bold">Pedidos</p>
                        <p className="text-white font-black text-xl leading-tight mt-0.5">
                          {member.orderCount}
                        </p>
                      </div>
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5">
                        <p className="text-zinc-500 text-[10px] uppercase font-bold">Última compra</p>
                        <p className="text-white font-bold text-xs leading-snug mt-1">
                          {formatDateTime(member.lastOrderAt)}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Gift size={16} className="text-amber-500" />
                      <h3 className="text-white font-black uppercase text-sm tracking-wide">
                        🎁 Sua próxima recompensa
                      </h3>
                    </div>
                    <p className="text-zinc-300 text-sm leading-relaxed">
                      {fidelity.nextRewardMessage}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-2 py-2">
                        <p className="text-zinc-500 text-[10px] uppercase font-bold">Faltam</p>
                        <p className="text-white font-black text-lg">{fidelity.remaining}</p>
                      </div>
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-2 py-2">
                        <p className="text-zinc-500 text-[10px] uppercase font-bold">Meta</p>
                        <p className="text-white font-black text-lg">{fidelity.goal}</p>
                      </div>
                    </div>
                    <StampProgress stamps={fidelity.stamps} goal={fidelity.goal} />
                  </section>

                  <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Info size={16} className="text-amber-500" />
                      <h3 className="text-white font-black uppercase text-sm tracking-wide">Como funciona</h3>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 space-y-2">
                        <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider">
                          💰 Cashback
                        </p>
                        <ul className="space-y-1.5">
                          {(activeRules?.cashback.howItWorks ?? []).map((line) => (
                            <li key={line} className="text-zinc-400 text-xs leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-amber-500">
                              {line}
                            </li>
                          ))}
                        </ul>
                        <p className="text-zinc-500 text-[11px] pt-1 border-t border-zinc-800/80">
                          Quando utilizar: {activeRules?.cashback.whenToUse}
                        </p>
                      </div>

                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 space-y-2">
                        <p className="text-amber-400 text-xs font-bold uppercase tracking-wider">
                          🍔 Fidelidade
                        </p>
                        <ul className="space-y-1.5">
                          {(activeRules?.fidelity.howItWorks ?? []).map((line) => (
                            <li key={line} className="text-zinc-400 text-xs leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-amber-500">
                              {line}
                            </li>
                          ))}
                        </ul>
                        <p className="text-zinc-500 text-[11px] pt-1 border-t border-zinc-800/80">
                          Quando utilizar: {activeRules?.fidelity.whenToUse}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Wallet size={16} className="text-amber-500" />
                      <h3 className="text-white font-black uppercase text-sm tracking-wide">Resumo</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-2 py-2">
                        <p className="text-zinc-500 text-[10px] uppercase font-bold leading-tight">Cashback recebido</p>
                        <p className="text-emerald-400 font-black text-sm mt-1">
                          {fmtMoney(data.summary?.cashbackReceived ?? cashbackProgram.receivedTotal)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-2 py-2">
                        <p className="text-zinc-500 text-[10px] uppercase font-bold leading-tight">Cashback utilizado</p>
                        <p className="text-white font-black text-sm mt-1">
                          {fmtMoney(data.summary?.cashbackUsed ?? cashbackProgram.usedTotal)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-zinc-950 border border-zinc-800 px-2 py-2">
                        <p className="text-zinc-500 text-[10px] uppercase font-bold leading-tight">Selos conquistados</p>
                        <p className="text-amber-400 font-black text-sm mt-1">
                          {data.summary?.stampsEarned ?? 0}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <History size={16} className="text-amber-500" />
                      <h3 className="text-white font-black uppercase text-sm tracking-wide">Últimos pedidos</h3>
                    </div>
                    {historyItems.length === 0 ? (
                      <p className="text-zinc-600 text-sm">Nenhum pedido encontrado.</p>
                    ) : (
                      <ul className="space-y-2">
                        {historyItems.map((o) => (
                          <li
                            key={o.id}
                            className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="text-white text-sm font-bold">Pedido #{o.orderNumber}</p>
                              <p className="text-zinc-500 text-[11px]">
                                {formatDateTime(o.createdAt)} · {ORDER_STATUS[o.status] || o.status}
                              </p>
                            </div>
                            <p className="text-amber-400 font-black text-sm shrink-0">{fmtMoney(o.total)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-3">
                    <h3 className="text-white font-black uppercase text-sm tracking-wide">
                      Histórico do Clube
                    </h3>
                    {ledgerItems.length === 0 ? (
                      <p className="text-zinc-600 text-sm">Ainda sem movimentações de cashback ou selos.</p>
                    ) : (
                      <ul className="space-y-2">
                        {ledgerItems.slice(0, 30).map((e) => (
                          <li
                            key={e.id}
                            className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-white text-sm font-bold">
                                {LEDGER_LABEL[e.type] || e.type}
                              </p>
                              <span className="text-zinc-500 text-[10px] shrink-0">
                                {formatDateTime(e.at)}
                              </span>
                            </div>
                            <p className="text-zinc-500 text-xs mt-0.5">
                              {e.description ||
                                (e.cashbackDelta != null
                                  ? fmtMoney(e.cashbackDelta)
                                  : e.stampsDelta != null
                                    ? `${e.stampsDelta > 0 ? '+' : ''}${e.stampsDelta} selo(s)`
                                    : e.rewardTitle || '—')}
                              {e.orderNumber != null ? ` · Pedido #${e.orderNumber}` : ''}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {fidelity.availableRewards.some((r) => r.available) ? (
                    <section className="rounded-2xl border border-amber-500/30 bg-zinc-900/90 p-4 space-y-2">
                      <h3 className="text-amber-400 font-black uppercase text-sm tracking-wide">
                        Recompensas disponíveis
                      </h3>
                      {fidelity.availableRewards.filter((r) => r.available).map((r) => (
                        <div key={r.id} className="rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5">
                          <p className="text-white text-sm font-bold">{r.title}</p>
                          <p className="text-zinc-500 text-xs mt-0.5">
                            Conquistada em {formatDateTime(r.earnedAt)}
                            {r.orderNumber != null ? ` · Pedido #${r.orderNumber}` : ''}
                          </p>
                          <p className="text-zinc-500 text-[11px] mt-1">
                            Solicite o resgate no atendimento da loja.
                          </p>
                        </div>
                      ))}
                    </section>
                  ) : null}

                  <Link href="/cardapio">
                    <Button
                      variant="outline"
                      className="w-full h-12 rounded-xl font-bold tracking-wider border-zinc-700 text-zinc-200 hover:border-amber-500/50 hover:text-amber-400"
                    >
                      Continuar pedindo
                    </Button>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>

            {!member && activeRules && (
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                <h3 className="text-white font-black uppercase text-sm tracking-wide flex items-center gap-2">
                  <Info size={16} className="text-amber-500" /> Regras do Clube
                </h3>
                <div className="space-y-3 text-xs text-zinc-400 leading-relaxed">
                  <div>
                    <p className="text-emerald-400 font-bold uppercase tracking-wider mb-1">Cashback</p>
                    <ul className="space-y-1">
                      {activeRules.cashback.howItWorks.map((line) => (
                        <li key={line}>• {line}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-amber-400 font-bold uppercase tracking-wider mb-1">Fidelidade</p>
                    <ul className="space-y-1">
                      {activeRules.fidelity.howItWorks.map((line) => (
                        <li key={line}>• {line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </PageTransition>
  );
}
