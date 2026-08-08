import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { getPublicReviews, PublicReviewsResponse } from '../lib/api';

function Stars({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={13}
          className={i <= n ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}
        />
      ))}
    </div>
  );
}

export function ReviewsSection() {
  const [data, setData] = useState<PublicReviewsResponse | null>(null);

  useEffect(() => {
    getPublicReviews()
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data || data.reviews.length === 0) return null;

  return (
    <section className="max-w-md mx-auto px-4 pb-2 space-y-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <h2 className="text-white font-black text-lg tracking-tight flex items-center gap-2">
            <span className="text-amber-400 tracking-tight">★★★★★</span>
            Avaliações
          </h2>
          <p className="text-zinc-500 text-xs mt-0.5">O que nossos clientes estão dizendo</p>
        </div>
        {data.average > 0 && (
          <div className="text-right">
            <p className="text-amber-500 font-black text-xl leading-none">{data.average.toFixed(1)}</p>
            <p className="text-zinc-600 text-[10px] uppercase font-bold">{data.count} avaliações</p>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {data.reviews.slice(0, 6).map((r, idx) => (
          <motion.article
            key={`${r.customerName}-${r.createdAt}-${idx}`}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-20px' }}
            transition={{ duration: 0.35, delay: idx * 0.04 }}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-white font-bold text-sm">{r.customerName}</p>
              <Stars n={r.stars} />
            </div>
            {r.comment && (
              <p className="text-zinc-400 text-sm leading-relaxed">“{r.comment}”</p>
            )}
          </motion.article>
        ))}
      </div>
    </section>
  );
}
