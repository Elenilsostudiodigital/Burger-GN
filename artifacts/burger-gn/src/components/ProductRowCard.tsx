import React from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Plus, Minus, PlayCircle, ListChecks, Crown } from 'lucide-react';
import type { Product } from '../lib/api';
import { formatBrl, productBadgeText, productEffectivePrice } from '../lib/productMarketing';

interface ProductRowCardProps {
  product: Product;
  index?: number;
  quantity?: number;
  clubeLoggedIn?: boolean;
  onSelect: (product: Product) => void;
  onQuickAdd?: (product: Product) => void;
  onQuantityChange?: (productId: number, delta: number) => void;
}

export function ProductRowCard({
  product,
  index = 0,
  quantity = 0,
  clubeLoggedIn = false,
  onSelect,
  onQuickAdd,
  onQuantityChange,
}: ProductRowCardProps) {
  const ingredients = Array.isArray(product.ingredients) ? product.ingredients : [];
  const addons = Array.isArray(product.addons) ? product.addons : [];
  const hasCustomization = ingredients.length > 0 || addons.length > 0;
  const badge = productBadgeText(product);
  const promoActive = !!product.isPromoActive;
  const locked = !!product.isClubeExclusive && !clubeLoggedIn;
  const effective = productEffectivePrice(product);
  const compareAt = product.compareAtPrice ? parseFloat(String(product.compareAtPrice)) : null;

  return (
    <motion.div
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
      onClick={() => onSelect(product)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(product);
        }
      }}
      className="w-full text-left group relative flex gap-3.5 rounded-2xl border border-zinc-800/90 bg-zinc-900/70 p-3 shadow-[0_6px_24px_rgba(0,0,0,0.25)] hover:border-zinc-700 hover:bg-zinc-900 active:scale-[0.99] transition-all cursor-pointer"
    >
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div className="space-y-1">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="text-white font-bold text-[15px] leading-snug tracking-tight line-clamp-2">
              {product.name}
            </h3>
            {badge ? (
              <span className="shrink-0 mt-0.5 inline-flex items-center gap-0.5 rounded-md bg-red-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                {badge}
              </span>
            ) : null}
          </div>
          {product.description && (
            <p className="text-zinc-500 text-xs leading-relaxed line-clamp-2">
              {product.description}
            </p>
          )}
          {hasCustomization && (
            <span className="inline-flex items-center gap-1 text-zinc-600 text-[10px] pt-0.5">
              <ListChecks size={11} /> Personalizável
            </span>
          )}
          {locked ? (
            <p className="text-amber-500/90 text-[11px] leading-snug pt-1 flex items-start gap-1">
              <Crown size={12} className="mt-0.5 shrink-0" />
              <span>
                Oferta exclusiva para membros do Clube Burger.{' '}
                <Link href="/clube" className="underline font-bold" onClick={e => e.stopPropagation()}>
                  Faça login ou cadastre-se para desbloquear.
                </Link>
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2.5">
          <div className="flex items-baseline gap-2 min-w-0">
            {promoActive && compareAt !== null && Number.isFinite(compareAt) ? (
              <span className="text-zinc-500 text-xs line-through">{formatBrl(compareAt)}</span>
            ) : null}
            <span className={`font-black text-[15px] tracking-tight ${locked ? 'text-zinc-500' : 'text-amber-500'}`}>
              {locked ? 'Exclusivo' : formatBrl(effective)}
            </span>
          </div>
          {!locked && onQuickAdd && onQuantityChange && (
            quantity === 0 ? (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onQuickAdd(product); }}
                className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20 group-hover:brightness-110 transition-all"
              >
                <Plus size={16} strokeWidth={2.5} />
              </button>
            ) : (
              <div
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1.5 bg-zinc-950/80 p-1 rounded-full border border-zinc-800"
              >
                <button
                  type="button"
                  onClick={() => onQuantityChange(product.id, -1)}
                  className="w-7 h-7 flex items-center justify-center bg-zinc-800 text-white rounded-full hover:bg-zinc-700 active:scale-95 transition-transform"
                >
                  <Minus size={12} />
                </button>
                <span className="font-bold text-white w-4 text-center text-xs">{quantity}</span>
                <button
                  type="button"
                  onClick={() => onQuantityChange(product.id, 1)}
                  className="w-7 h-7 flex items-center justify-center bg-amber-500 text-zinc-950 rounded-full hover:brightness-110 active:scale-95 transition-transform"
                >
                  <Plus size={12} />
                </button>
              </div>
            )
          )}
        </div>
      </div>

      <div className="relative shrink-0 w-[96px] h-[96px] sm:w-[108px] sm:h-[108px] rounded-xl overflow-hidden bg-zinc-800">
        <img
          src={product.image || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop'}
          alt={product.name}
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${locked ? 'opacity-70' : ''}`}
          loading="lazy"
        />
        {product.videoUrl && (
          <div className="absolute top-1.5 right-1.5 bg-black/55 backdrop-blur text-white p-1 rounded-full">
            <PlayCircle size={14} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
