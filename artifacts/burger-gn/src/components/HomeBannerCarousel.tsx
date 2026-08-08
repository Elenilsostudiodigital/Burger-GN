import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { BannerItem, getBanners } from '../lib/api';

const INTERVAL_MS = 4500;

export function HomeBannerCarousel() {
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    getBanners()
      .then((list) => setBanners(list.filter((b) => b.active)))
      .catch(() => setBanners([]));
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % banners.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [banners.length]);

  if (!banners.length) return null;

  const current = banners[index % banners.length];

  return (
    <section className="relative max-w-md mx-auto px-4 pt-4">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 aspect-[16/8] bg-zinc-900">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <img
              src={current.imageUrl}
              alt={current.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <p className="text-amber-400 text-[10px] font-bold uppercase tracking-[0.18em]">
                {current.type.replace('_', ' ')}
              </p>
              <h3 className="text-white font-black text-lg leading-tight">{current.title}</h3>
              {current.subtitle && (
                <p className="text-zinc-300 text-xs mt-0.5">{current.subtitle}</p>
              )}
              {current.link && (
                <Link
                  href={current.link}
                  className="inline-block mt-2 text-amber-500 text-xs font-bold uppercase tracking-wider"
                >
                  Ver agora →
                </Link>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Banner ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index % banners.length ? 'w-5 bg-amber-500' : 'w-1.5 bg-zinc-700'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
