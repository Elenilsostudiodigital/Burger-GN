import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  getAdminReviews, AdminReviewRow,
} from '../../lib/api';
import { useAdmin } from '../../context/AdminContext';
import {
  LogOut, Loader2, Star, MessageSquareQuote,
} from 'lucide-react';
import { AdminBottomNav } from '../../components/AdminBottomNav';

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

export default function AdminReviews() {
  const [, setLocation] = useLocation();
  const { logout } = useAdmin();
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminReviews()
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, []);

  const avg = reviews.filter(r => r.stars > 0).length
    ? (reviews.filter(r => r.stars > 0).reduce((a, r) => a + r.stars, 0) / reviews.filter(r => r.stars > 0).length)
    : 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <header className="sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white font-black uppercase text-base flex items-center gap-2">
              <MessageSquareQuote size={18} className="text-amber-500" /> Avaliações
            </h1>
            <p className="text-zinc-600 text-xs">Somente administradores</p>
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
            <p className="text-zinc-500 text-[10px] uppercase font-bold">Média</p>
            <p className="text-amber-500 font-black text-2xl">{avg ? avg.toFixed(1) : '—'}</p>
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
            {reviews.map(r => (
              <article key={`${r.orderId}-${r.createdAt}`}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
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
                  </div>
                </div>
                {r.comment && (
                  <p className="text-zinc-300 text-sm bg-zinc-950 rounded-xl px-3 py-2 border border-zinc-800">
                    “{r.comment}”
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </main>

      <AdminBottomNav active="/admin/avaliacoes" />
    </div>
  );
}
