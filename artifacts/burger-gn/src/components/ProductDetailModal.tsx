import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Check } from 'lucide-react';
import type { Product, Addon } from '../lib/api';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAdd: (product: Product, addons: Addon[], notes: string, quantity: number) => void;
}

export function ProductDetailModal({ product, onClose, onAdd }: ProductDetailModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Addon[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setQuantity(1);
    setSelected([]);
    setNotes('');
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [product]);

  if (!product) return null;

  const toggleAddon = (addon: Addon) => {
    setSelected(prev =>
      prev.some(a => a.name === addon.name)
        ? prev.filter(a => a.name !== addon.name)
        : [...prev, addon]
    );
  };

  const unitPrice = parseFloat(product.price) + selected.reduce((acc, a) => acc + a.price, 0);
  const totalPrice = unitPrice * quantity;
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative w-full sm:max-w-md h-[min(92dvh,920px)] max-h-[92dvh] bg-zinc-950 rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col border border-zinc-800 shadow-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Scrollable content only */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="relative w-full h-48 sm:h-56 bg-zinc-900">
                {product.videoUrl ? (
                  <video
                    src={product.videoUrl}
                    poster={product.image || undefined}
                    className="w-full h-full object-cover"
                    controls
                    playsInline
                  />
                ) : (
                  <img
                    src={product.image || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=400&fit=crop'}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar"
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-5">
                <div>
                  <h2 className="text-white font-black uppercase text-xl leading-tight tracking-tight">{product.name}</h2>
                  <p className="text-amber-500 font-black text-lg mt-1">{fmt(parseFloat(product.price))}</p>
                </div>

                {product.description && (
                  <p className="text-zinc-400 text-sm leading-relaxed">{product.description}</p>
                )}

                {product.ingredients.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Ingredientes</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {product.ingredients.map((ing, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs">
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {product.addons.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Adicionais</h3>
                    <div className="space-y-2">
                      {product.addons.map((addon, idx) => {
                        const isSelected = selected.some(a => a.name === addon.name);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleAddon(addon)}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all ${
                              isSelected ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'
                            }`}
                          >
                            <span className={`text-sm font-medium ${isSelected ? 'text-amber-500' : 'text-zinc-300'}`}>{addon.name}</span>
                            <div className="flex items-center gap-2.5">
                              <span className={`text-sm font-bold ${isSelected ? 'text-amber-500' : 'text-zinc-400'}`}>+ {fmt(addon.price)}</span>
                              <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-zinc-700'}`}>
                                {isSelected && <Check size={12} className="text-zinc-950" />}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2 pb-2">
                  <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Observações</h3>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Ex: sem cebola, ponto bem passado..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white text-sm resize-none focus:border-amber-500 focus:outline-none h-16 placeholder:text-zinc-600"
                  />
                </div>
              </div>
            </div>

            {/* Always-visible confirm bar */}
            <div className="shrink-0 z-20 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md px-5 pt-3 pb-3 space-y-3">
              <div className="flex items-center justify-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl py-2">
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 active:scale-95 transition-transform"
                >
                  <Minus size={16} />
                </button>
                <span className="font-bold text-white w-6 text-center text-lg">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-10 h-10 flex items-center justify-center bg-amber-500 text-zinc-950 rounded-lg hover:brightness-110 active:scale-95 transition-transform"
                >
                  <Plus size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => { onAdd(product, selected, notes.trim(), quantity); onClose(); }}
                className="w-full min-h-14 py-3.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-[0.98] shadow-[0_8px_24px_rgba(245,158,11,0.25)]"
              >
                Confirmar Pedido • {fmt(totalPrice)}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
