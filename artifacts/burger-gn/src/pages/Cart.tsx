import React, { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { BottomNav } from '../components/BottomNav';
import { PageTransition } from '../components/PageTransition';
import { StoreClosedBanner, useStoreStatus } from '../components/StoreClosedBanner';
import { ArrowLeft, Trash2, Plus, Minus, Tag, Bike } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Cart() {
  const [, setLocation] = useLocation();
  const { cartItems, updateQuantity, removeItem, clearCart, subtotal, totalItems } = useCart();
  const { isClosed, status } = useStoreStatus(true);

  const lineTotal = (item: (typeof cartItems)[number]) => {
    const addons = Array.isArray(item.selectedAddons) ? item.selectedAddons : [];
    return (Number(item.item.price) + addons.reduce((acc, a) => acc + (Number(a.price) || 0), 0)) * item.quantity;
  };

  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  // Delivery fee & coupon discount are finalized at checkout — show structure clearly.
  const deliveryFeePlaceholder = null as number | null;
  const discount = 0;
  const estimatedTotal = Math.max(0, subtotal + (deliveryFeePlaceholder ?? 0) - discount);

  /** Carrinho vazio → volta ao cardápio (não permanece nesta tela). */
  useEffect(() => {
    if (cartItems.length === 0) {
      setLocation('/cardapio');
    }
  }, [cartItems.length, setLocation]);

  const handleClearCart = () => {
    if (!window.confirm('Limpar carrinho?\n\nTodos os produtos e adicionais serão removidos.')) {
      return;
    }
    clearCart();
    try {
      sessionStorage.removeItem('lastOrder');
    } catch { /* ignore */ }
    setLocation('/cardapio');
  };

  if (cartItems.length === 0) {
    return (
      <PageTransition className="bg-[#0a0a0a]">
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="bg-[#0a0a0a]">
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800 px-6 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={() => setLocation('/cardapio')} className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-black text-white uppercase tracking-tight ml-2">Carrinho</h1>
          </div>
          {totalItems > 0 && (
            <span className="text-xs font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
              {totalItems} {totalItems === 1 ? 'item' : 'itens'}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 pb-40">
          <div className="space-y-5">
            <div className="space-y-3">
              <h2 className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-0.5">Itens do pedido</h2>
              <AnimatePresence>
                {cartItems.map((cartItem) => (
                  <motion.div
                    key={cartItem.lineId}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97, height: 0, marginBottom: 0 }}
                    className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 flex gap-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.2)]"
                  >
                    <div className="w-[72px] h-[72px] rounded-xl overflow-hidden shrink-0 bg-zinc-800">
                      <img src={cartItem.item.image} alt={cartItem.item.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="text-white font-bold leading-tight text-sm line-clamp-2">{cartItem.item.name}</h3>
                        <button onClick={() => removeItem(cartItem.lineId)}
                          className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors bg-zinc-950 rounded-lg shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {cartItem.selectedAddons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {cartItem.selectedAddons.map((a, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-400">
                              + {a.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {cartItem.notes && (
                        <p className="text-zinc-500 text-xs italic mt-1 line-clamp-2">"{cartItem.notes}"</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-amber-500 font-black text-sm">{fmt(lineTotal(cartItem))}</span>
                        <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-full border border-zinc-800">
                          <button onClick={() => updateQuantity(cartItem.lineId, -1)}
                            className="w-7 h-7 flex items-center justify-center bg-zinc-800 text-white rounded-full hover:bg-zinc-700">
                            <Minus size={13} />
                          </button>
                          <span className="font-bold text-white text-sm w-4 text-center">{cartItem.quantity}</span>
                          <button onClick={() => updateQuantity(cartItem.lineId, 1)}
                            className="w-7 h-7 flex items-center justify-center bg-amber-500 text-zinc-950 rounded-full hover:brightness-110">
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={handleClearCart}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-zinc-800 bg-zinc-950/60 text-red-400 text-sm font-bold uppercase tracking-wider hover:border-red-500/40 hover:bg-red-500/5 transition-colors"
            >
              <Trash2 size={16} />
              Limpar carrinho
            </button>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3 shadow-[0_8px_28px_rgba(0,0,0,0.25)]">
              <h3 className="text-white font-black uppercase tracking-wider text-sm">Resumo do pedido</h3>

              <div className="flex justify-between text-sm text-zinc-400">
                <span>Quantidade de itens</span>
                <span className="text-zinc-200 font-bold">{totalItems}</span>
              </div>
              <div className="flex justify-between text-sm text-zinc-400">
                <span>Subtotal</span>
                <span className="text-zinc-200">{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-zinc-400">
                <span className="flex items-center gap-1.5"><Bike size={14} /> Taxa de entrega</span>
                <span className="text-zinc-500 text-xs italic">Calculada no checkout</span>
              </div>
              <div className="flex justify-between text-sm text-zinc-400">
                <span className="flex items-center gap-1.5"><Tag size={14} /> Desconto</span>
                <span className="text-zinc-500 text-xs italic">Cupom no checkout</span>
              </div>

              <div className="h-px w-full bg-zinc-800" />

              <div className="flex justify-between items-center">
                <div>
                  <p className="text-white font-black uppercase tracking-wider text-base">Total parcial</p>
                  <p className="text-zinc-600 text-[11px]">Sem taxa e descontos finais</p>
                </div>
                <span className="text-amber-500 font-black text-2xl">{fmt(estimatedTotal)}</span>
              </div>
            </div>

            <StoreClosedBanner className="mb-3" />
            {isClosed ? (
              <Button
                size="lg"
                disabled
                className="w-full min-h-[58px] text-base font-bold tracking-wider rounded-2xl opacity-50 cursor-not-allowed"
              >
                {status?.message || 'Loja fechada'}
              </Button>
            ) : (
              <Link href="/checkout" className="block">
                <Button size="lg" className="w-full min-h-[58px] text-base font-bold tracking-wider rounded-2xl shadow-lg shadow-amber-500/20">
                  FINALIZAR PEDIDO
                </Button>
              </Link>
            )}
            <Link href="/cardapio" className="block text-center text-zinc-500 text-sm font-bold uppercase tracking-wider hover:text-amber-500 transition-colors py-1">
              Continuar comprando
            </Link>
          </div>
      </main>

      <BottomNav />
    </PageTransition>
  );
}
