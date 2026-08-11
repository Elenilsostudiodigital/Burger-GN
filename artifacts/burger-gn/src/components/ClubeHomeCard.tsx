import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { getPublicClubeMe } from '../lib/api';
import {
  firstName,
  fmtCashback,
  getClubeSessionProfile,
  getSavedClubePhone,
  saveClubeSessionFromMe,
  ClubeSessionProfile,
} from '../lib/clubeCliente';

/** Top-of-page club entry: generic CTA or personalized member card. */
export function ClubeHomeCard() {
  const [profile, setProfile] = useState<ClubeSessionProfile | null>(() => getClubeSessionProfile());
  const [loading, setLoading] = useState(() => !!getSavedClubePhone());

  const refresh = useCallback(async () => {
    const phone = getSavedClubePhone();
    if (!phone) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const cached = getClubeSessionProfile();
    if (cached) setProfile(cached);
    setLoading(true);
    try {
      const data = await getPublicClubeMe(phone);
      if (data.found && data.member && data.fidelity) {
        saveClubeSessionFromMe(data);
        setProfile({
          phone: data.member.phone,
          name: data.member.name,
          cashbackBalance: data.member.cashbackBalance,
          stamps: data.fidelity.stamps,
          goal: data.fidelity.goal,
          remaining: data.fidelity.remaining,
          progress: data.fidelity.progress,
          nextRewardMessage: data.fidelity.nextRewardMessage,
          rewardTitle: data.fidelity.rewardTitle,
          orderCount: data.member.orderCount,
          updatedAt: new Date().toISOString(),
        });
      } else {
        setProfile(null);
      }
    } catch {
      if (!cached) setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => { void refresh(); };
    window.addEventListener('bgn:clube-session-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('bgn:clube-session-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  if (loading && !profile) {
    return (
      <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 animate-pulse">
        <div className="h-3 w-28 bg-zinc-800 rounded mb-3" />
        <div className="h-4 w-40 bg-zinc-800 rounded mb-3" />
        <div className="h-2 w-full bg-zinc-800 rounded" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Link
        href="/clube"
        className="group flex items-center justify-between gap-3 w-full rounded-2xl border border-amber-500/35 bg-gradient-to-r from-amber-500/15 via-zinc-900 to-zinc-950 px-4 py-3 shadow-[0_0_24px_rgba(245,158,11,0.12)] hover:border-amber-400/55 hover:shadow-[0_0_28px_rgba(245,158,11,0.2)] transition-all"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="text-lg leading-none">🍔</span>
          <span className="text-amber-400 font-black text-sm tracking-tight truncate group-hover:text-amber-300 transition-colors">
            Clube Burger GN
          </span>
        </span>
        <ArrowRight size={16} className="text-amber-500/80 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    );
  }

  const filled = Math.min(profile.stamps, profile.goal);
  const pct = Math.min(100, Math.round((filled / Math.max(1, profile.goal)) * 100));

  return (
    <Link href="/clube">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-950 px-4 py-3.5 shadow-[0_0_24px_rgba(245,158,11,0.12)] hover:border-amber-400/55 transition-all cursor-pointer"
      >
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="min-w-0">
            <p className="text-amber-500/90 text-[10px] font-bold uppercase tracking-[0.16em]">
              Clube Burger GN
            </p>
            <p className="text-white font-black text-base truncate">
              Olá, {firstName(profile.name)}
            </p>
          </div>
          <ArrowRight size={16} className="text-amber-500/80 shrink-0 mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2.5">
          <div className="rounded-xl bg-zinc-950/70 border border-zinc-800 px-2.5 py-2">
            <p className="text-zinc-500 text-[9px] font-bold uppercase">💰 Cashback</p>
            <p className="text-emerald-400 font-black text-sm mt-0.5">
              {fmtCashback(profile.cashbackBalance)}
            </p>
          </div>
          <div className="rounded-xl bg-zinc-950/70 border border-zinc-800 px-2.5 py-2">
            <p className="text-zinc-500 text-[9px] font-bold uppercase">🍔 Selos</p>
            <p className="text-amber-400 font-black text-sm mt-0.5">
              {profile.stamps} / {profile.goal}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
            <span>📈 Progresso</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-zinc-400 text-[11px] leading-snug">
            🎁 {profile.nextRewardMessage || `Faltam ${profile.remaining} selos para ${profile.rewardTitle}`}
          </p>
        </div>
      </motion.div>
    </Link>
  );
}
