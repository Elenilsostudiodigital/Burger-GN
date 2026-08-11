import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProducts, getPublicClubeMe, Product } from '../lib/api';
import {
  getSavedClubePhone,
  toNationalWhatsappDigits,
} from '../lib/clubeCliente';

const LATER_KEY = 'bgn_clube_redeem_later';

function norm(v: string | null | undefined) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isEligibleFreeBurger(p: Product): boolean {
  const slug = norm(p.categorySlug);
  const cat = norm(p.categoryName);
  const name = norm(p.name);
  if (slug.includes('combo') || cat.includes('combo') || name.includes('combo')) return false;
  return (
    slug.includes('hamburguer') ||
    slug.includes('burger') ||
    slug.includes('smash') ||
    cat.includes('hamburguer') ||
    cat.includes('burger') ||
    cat.includes('smash') ||
    name.includes('hamburguer') ||
    name.includes('smash')
  );
}

export interface FidelityRedeemSelection {
  rewardId: string;
  product: Product;
}

interface Props {
  phone: string;
  /** When user picks a burger to redeem now. */
  onRedeem: (selection: FidelityRedeemSelection) => void;
  /** Current applied redeem (if any). */
  applied?: FidelityRedeemSelection | null;
  onClear?: () => void;
  fidelityDiscount?: number;
}

/**
 * Additive Clube fidelity redeem prompt on checkout — does not change the
 * existing checkout steps; only offers optional free-burger redemption.
 */
export function ClubeFidelityRedeemPrompt({
  phone,
  onRedeem,
  applied,
  onClear,
  fidelityDiscount = 0,
}: Props) {
  const [phase, setPhase] = useState<'hidden' | 'ask' | 'pick'>('hidden');
  const [rewardId, setRewardId] = useState<string | null>(null);
  const [rewardTitle, setRewardTitle] = useState('hambúrguer grátis');
  const [burgers, setBurgers] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const digits = useMemo(() => toNationalWhatsappDigits(phone || getSavedClubePhone()), [phone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (applied) {
        setPhase('hidden');
        return;
      }
      if (digits.length < 10) return;
      try {
        if (sessionStorage.getItem(`${LATER_KEY}:${digits}`)) return;
      } catch { /* ignore */ }

      setLoading(true);
      try {
        const me = await getPublicClubeMe(digits);
        if (cancelled || !me.found) return;
        const reward = (me.fidelity?.availableRewards ?? []).find((r) => r.available && !r.redeemedAt);
        if (!reward) return;
        setRewardId(reward.id);
        setRewardTitle(reward.title || 'hambúrguer grátis');
        setPhase('ask');
      } catch { /* ignore */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [digits, applied]);

  const openPicker = async () => {
    setLoading(true);
    try {
      const products = await getProducts();
      setBurgers(products.filter((p) => p.available && isEligibleFreeBurger(p)));
      setPhase('pick');
    } catch {
      setBurgers([]);
      setPhase('pick');
    } finally {
      setLoading(false);
    }
  };

  const saveLater = () => {
    try {
      if (digits) sessionStorage.setItem(`${LATER_KEY}:${digits}`, '1');
    } catch { /* ignore */ }
    setPhase('hidden');
  };

  if (applied) {
    return (
      <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 space-y-2">
        <p className="text-emerald-400 text-sm font-bold">
          🎁 Hambúrguer grátis: {applied.product.name}
        </p>
        <p className="text-zinc-400 text-xs">
          Desconto de {fidelityDiscount > 0
            ? `R$ ${fidelityDiscount.toFixed(2).replace('.', ',')}`
            : '100% no hambúrguer'}. Combos não entram. Taxa de entrega cobrada normalmente.
        </p>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-zinc-500 text-xs font-bold uppercase tracking-wider hover:text-amber-400"
          >
            Remover resgate
          </button>
        ) : null}
      </div>
    );
  }

  if (phase === 'hidden' && !loading) return null;

  return (
    <AnimatePresence>
      {phase !== 'hidden' ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="rounded-2xl border border-amber-500/40 bg-gradient-to-b from-amber-500/15 to-zinc-950 px-4 py-4 space-y-3"
        >
          {phase === 'ask' ? (
            <>
              <p className="text-amber-300 font-black text-sm">
                🎁 Você possui um hambúrguer grátis disponível.
              </p>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Deseja resgatar agora? ({rewardTitle})
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading || !rewardId}
                  onClick={() => void openPicker()}
                  className="h-11 rounded-xl bg-amber-500 text-zinc-950 font-black text-xs uppercase tracking-wide"
                >
                  ✅ Resgatar agora
                </button>
                <button
                  type="button"
                  onClick={saveLater}
                  className="h-11 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 font-bold text-xs uppercase tracking-wide"
                >
                  ⏳ Guardar para depois
                </button>
              </div>
            </>
          ) : null}

          {phase === 'pick' ? (
            <>
              <p className="text-white font-black text-sm">Escolha seu hambúrguer grátis</p>
              <p className="text-zinc-500 text-xs">Combos não participam desta recompensa.</p>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {burgers.length === 0 ? (
                  <p className="text-zinc-500 text-sm">Nenhum hambúrguer elegível encontrado no cardápio.</p>
                ) : (
                  burgers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (!rewardId) return;
                        onRedeem({ rewardId, product: p });
                        setPhase('hidden');
                      }}
                      className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 hover:border-amber-500/50 transition-colors"
                    >
                      <p className="text-white text-sm font-bold truncate">{p.name}</p>
                      <p className="text-emerald-400 text-xs font-bold mt-0.5">
                        Grátis · de R$ {parseFloat(p.price).toFixed(2).replace('.', ',')}
                      </p>
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={saveLater}
                className="w-full text-zinc-500 text-xs font-bold uppercase tracking-wider"
              >
                Guardar para depois
              </button>
            </>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
