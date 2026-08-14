import { useEffect, useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { getPublicClubeMe, type PublicClubeMeResponse } from '../lib/api';
import { getSavedClubePhone } from '../lib/clubeCliente';

function fmt(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function computeApplicable(opts: {
  balance: number;
  payable: number;
  maxUsePercent: number | null;
}): number {
  const balance = Math.max(0, Math.round(opts.balance * 100) / 100);
  const payable = Math.max(0, Math.round(opts.payable * 100) / 100);
  if (balance <= 0 || payable <= 0) return 0;
  let cap = payable;
  if (opts.maxUsePercent != null && Number.isFinite(opts.maxUsePercent) && opts.maxUsePercent >= 0) {
    cap = Math.min(cap, Math.round(payable * (Math.min(100, opts.maxUsePercent) / 100) * 100) / 100);
  }
  return Math.min(balance, cap);
}

export function ClubeCashbackCheckoutCard({
  phone,
  payableBeforeCashback,
  useCashback,
  onChange,
}: {
  phone: string;
  payableBeforeCashback: number;
  useCashback: boolean;
  onChange: (next: { use: boolean; amount: number; balance: number }) => void;
}) {
  const [payload, setPayload] = useState<PublicClubeMeResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const lookupPhone = (phone || getSavedClubePhone() || '').trim();

  useEffect(() => {
    if (!lookupPhone || lookupPhone.replace(/\D/g, '').length < 10) {
      setPayload(null);
      onChange({ use: false, amount: 0, balance: 0 });
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getPublicClubeMe(lookupPhone)
      .then((me) => {
        if (cancelled) return;
        setPayload(me);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch on phone
  }, [lookupPhone]);

  const balance = useMemo(() => {
    if (!payload?.found || !payload.cashbackProgram?.enabled) return 0;
    return parseFloat(String(payload.cashbackProgram.balance ?? payload.member?.cashbackBalance ?? 0)) || 0;
  }, [payload]);

  const maxUsePercent = useMemo(() => {
    const raw = payload?.cashbackProgram?.maxUsePercent ?? payload?.rules?.cashback?.maxUsePercent;
    if (raw == null || raw === '') return null;
    const n = parseFloat(String(raw));
    return Number.isFinite(n) ? n : null;
  }, [payload]);

  const applicable = useMemo(
    () => computeApplicable({ balance, payable: payableBeforeCashback, maxUsePercent }),
    [balance, payableBeforeCashback, maxUsePercent],
  );

  useEffect(() => {
    if (applicable <= 0) {
      if (useCashback) onChange({ use: false, amount: 0, balance });
      return;
    }
    onChange({ use: useCashback, amount: useCashback ? applicable : 0, balance });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicable, balance, useCashback]);

  if (loading || !payload?.found || !payload.cashbackProgram?.enabled || balance <= 0 || applicable <= 0) {
    return null;
  }

  const warning = payload.cashbackProgram.warning ?? payload.warnings?.cashback;

  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-emerald-500/15 p-2 text-emerald-400">
          <Wallet size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-emerald-300 font-black text-sm leading-snug">
            💰 Você possui {fmt(balance)} de cashback disponível.
          </p>
          {applicable < balance && (
            <p className="text-emerald-600/90 text-xs mt-1">
              Neste pedido você pode usar até {fmt(applicable)}
              {maxUsePercent != null ? ` (limite de ${maxUsePercent.toFixed(0)}%)` : ''}.
            </p>
          )}
          {warning?.active && (
            <p className="text-amber-400 text-xs mt-1.5 font-medium">{warning.message}</p>
          )}
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer select-none rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3">
        <input
          type="checkbox"
          checked={useCashback}
          onChange={(e) => onChange({ use: e.target.checked, amount: e.target.checked ? applicable : 0, balance })}
          className="h-5 w-5 rounded border-zinc-600 accent-emerald-500"
        />
        <span className="text-white text-sm font-bold">Utilizar meu cashback</span>
      </label>

      {useCashback && (
        <div className="rounded-xl bg-zinc-950/80 border border-zinc-800 px-3 py-2.5 text-sm space-y-1">
          <div className="flex justify-between text-zinc-400">
            <span>Subtotal do pedido</span>
            <span>{fmt(payableBeforeCashback)}</span>
          </div>
          <div className="flex justify-between text-emerald-400 font-bold">
            <span>Cashback</span>
            <span>-{fmt(applicable)}</span>
          </div>
          <div className="flex justify-between text-white font-black pt-1 border-t border-zinc-800">
            <span>Total</span>
            <span>{fmt(Math.max(0, payableBeforeCashback - applicable))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
