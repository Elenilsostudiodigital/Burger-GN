import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  getAdminReviews, moderateReview, deleteReview, AdminReviewRow,
} from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import {
  LayoutDashboard, UtensilsCrossed, Tag, MapPin, Navigation, Settings,
  LogOut, Loader2, Upload, TrendingUp, Crown, Star, MessageSquareQuote,
  Check, EyeOff, Trash2, Users,
} from 'lucide-react';

function AdminNav({ active }: { active: string }) {
  const items = [
    { href: '/admin', icon: <LayoutDashboard size={17} />, label: 'Pedidos' },
    { href: '/admin/clientes', icon: <Users size={17} />, label: 'Clientes' },
    { href: '/admin/avaliacoes', icon: <Star size={17} />, label: 'Avaliações' },
    { href: '/admin/cardapio', icon: <UtensilsCrossed size={17} />, label: 'Cardápio' },
    { href: '/admin/financeiro', icon: <TrendingUp size={17} />, label: 'Financeiro' },
    { href: '/admin/cupons', icon: <Tag size={17} />, label: 'Cupons' },
    { href: '/admin/clube', icon: <Crown size={17} />, label: 'Clube' },
    { href: '/admin/taxas', icon: <MapPin size={17} />, label: 'Bairros' },
    { href: '/admin/entrega-km', icon: <Navigation size={17} />, label: 'Por KM' },
    { href: '/admin/config', icon: <Settings size={17} />, label: 'Config' },
    { href: '/admin/importar', icon: <Upload size={17} />, label: 'Importar' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40">
      <div className="max-w-3xl mx-auto flex overflow-x-auto no-scrollbar">
        {items.map(item => (
          <Link key={item.href} href={item.href} className="flex-1 min-w-[64px]">
            <div className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors ${active === item.href ? 'text-amber-500' : 'text-zinc-500 hover:text-white'}`}>
              {item.icon}
              <span className="text-[9px] font-bold uppercase">{item.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={14}
          className={i <= n ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}
        />
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  pending: { text: 'Pendente', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  approved: { text: 'Aprovada', className: 'text-green-400 bg-green-500/10 border-green-500/20' },
  hidden: { text: 'Oculta', className: 'text-zinc-400 bg-zinc-800 border-zinc-700' },
};

export default function AdminReviews() {
  const [, setLocation] = useLocation();
  const { logout } = useAdmin();
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [average, setAverage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    const data = await getAdminReviews();
    setReviews(data.reviews);
    setAverage(data.average);
  };

  useEffect(() => {
    load()
      .catch(() => { setReviews([]); setAverage(0); })
      .finally(() => setLoading(false));
  }, []);

  const run = async (orderId: number, fn: () => Promise<void>) => {
    setBusyId(orderId);
    try { await fn(); await load(); }
    finally { setBusyId(null); }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white font-black uppercase text-base flex items-center gap-2">
              <MessageSquareQuote size={18} className="text-amber-500" /> Avaliações
            </h1>
            <p className="text-zinc-600 text-xs">Aprovar, ocultar ou excluir</p>
          </div>
          <button type="button" onClick={async () => { await logout(); setLocation('/'); }}
            className="p-2 text-zinc-400 hover:text-red-400" title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-zinc-500 text-[10px] uppercase font-bold">Total</p>
            <p className="text-amber-500 font-black text-2xl">{reviews.length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-zinc-500 text-[10px] uppercase font-bold">Média geral</p>
            <p className="text-amber-500 font-black text-2xl">{average ? average.toFixed(1) : '—'}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-amber-500" size={28} />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16 text-zinc-600 text-sm">
            Nenhuma avaliação recebida ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(r => {
              const status = STATUS_LABEL[r.status || 'approved'] || STATUS_LABEL.pending;
              return (
                <article key={`${r.orderId}-${r.createdAt}`}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-amber-500 font-black">#{r.orderNumber}</p>
                      <p className="text-white font-bold text-sm">{r.customerName}</p>
                      <p className="text-zinc-600 text-xs">
                        {new Date(r.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      {r.deliveredOk ? <Stars n={r.stars} /> : (
                        <span className="text-red-400 text-[10px] font-black uppercase">Não chegou ok</span>
                      )}
                      <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${status.className}`}>
                        {status.text}
                      </span>
                    </div>
                  </div>
                  {r.comment && (
                    <p className="text-zinc-300 text-sm bg-zinc-950 rounded-xl px-3 py-2 border border-zinc-800">
                      “{r.comment}”
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === r.orderId}
                      onClick={() => run(r.orderId, async () => { await moderateReview(r.orderId, 'approved'); })}
                      className="h-9 px-3 rounded-lg bg-green-500/15 text-green-400 text-xs font-bold uppercase flex items-center gap-1.5 hover:bg-green-500/25"
                    >
                      <Check size={14} /> Aprovar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.orderId}
                      onClick={() => run(r.orderId, async () => { await moderateReview(r.orderId, 'hidden'); })}
                      className="h-9 px-3 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold uppercase flex items-center gap-1.5 hover:bg-zinc-700"
                    >
                      <EyeOff size={14} /> Ocultar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.orderId}
                      onClick={() => {
                        if (!confirm('Excluir esta avaliação?')) return;
                        void run(r.orderId, async () => { await deleteReview(r.orderId); });
                      }}
                      className="h-9 px-3 rounded-lg bg-red-950/40 text-red-400 text-xs font-bold uppercase flex items-center gap-1.5 hover:bg-red-900/40"
                    >
                      <Trash2 size={14} /> Excluir
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <AdminNav active="/admin/avaliacoes" />
    </div>
  );
}
