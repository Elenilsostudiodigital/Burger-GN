import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Check } from 'lucide-react';
import type { Product, Addon } from '../lib/api';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAdd: (product: Product, addons: Addon[], notes: string, quantity: number) => void;
}

function safeList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function ProductDetailModal({ product, onClose, onAdd }: ProductDetailModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Addon[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setQuantity(1);
    setSelected([]);
    setNotes('');
  }, [product?.id]);

  // Lock scroll without leaving body stuck after close/crash (iOS-safe).
  useEffect(() => {
    if (!product) {
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open');
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    return () => {
      document.body.style.overflow = prevOverflow || '';
      document.body.classList.remove('modal-open');
    };
  }, [product]);

  // Always restore scroll if this component unmounts for any reason.
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open');
    };
  }, []);

  const toggleAddon = (addon: Addon) => {
    setSelected(prev =>
      prev.some(a => a.name === addon.name)
        ? prev.filter(a => a.name !== addon.name)
        : [...prev, addon]
    );
  };

  const ingredients = safeList(product?.ingredients);
  const addons = safeList(product?.addons);
  const unitPrice = product
    ? (parseFloat(product.price) || 0) + selected.reduce((acc, a) => acc + (Number(a.price) || 0), 0)
    : 0;
  const totalPrice = unitPrice * quantity;
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  return (
    <AnimatePresence
      onExitComplete={() => {
        document.body.style.overflow = '';
        document.body.classList.remove('modal-open');
      }}
    >
      {product && (
        <motion.div
          key={product.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full sm:max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col border border-zinc-800 shadow-2xl"
            style={{
              height: 'min(92vh, 920px)',
              maxHeight: '92vh',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="relative w-full h-48 sm:h-56 bg-zinc-900">
                {product.videoUrl ? (
                  <video
                    src={product.videoUrl}
                    poster={product.image || undefined}
                    className="w-full h-full object-cover"
                    controls
                    playsInline
                    preload="metadata"
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
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/70 flex items-center justify-center text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-5">
                <div>
                  <h2 className="text-white font-black uppercase text-xl leading-tight tracking-tight">{product.name}</h2>
                  <p className="text-amber-500 font-black text-lg mt-1">{fmt(parseFloat(product.price) || 0)}</p>
                </div>

                {product.description && (
                  <p className="text-zinc-400 text-sm leading-relaxed">{product.description}</p>
                )}

                {ingredients.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Ingredientes</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {ingredients.map((ing, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs">
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {addons.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Adicionais</h3>
                    <div className="space-y-2">
                      {addons.map((addon, idx) => {
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
                              <span className={`text-sm font-bold ${isSelected ? 'text-amber-500' : 'text-zinc-400'}`}>+ {fmt(Number(addon.price) || 0)}</span>
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

            <div className="shrink-0 z-20 border-t border-zinc-800 bg-zinc-950 px-5 pt-3 pb-3 space-y-3">
              <div className="flex items-center justify-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl py-2">
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center bg-zinc-800 text-white rounded-lg active:scale-95"
                >
                  <Minus size={16} />
                </button>
                <span className="font-bold text-white w-6 text-center text-lg">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-10 h-10 flex items-center justify-center bg-amber-500 text-zinc-950 rounded-lg active:scale-95"
                >
                  <Plus size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  onAdd(product, selected, notes.trim(), quantity);
                  onClose();
                }}
                className="w-full min-h-14 py-3.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 active:scale-[0.98]"
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
