import React from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { BottomNav } from '../components/BottomNav';
import { PageTransition } from '../components/PageTransition';
import { ArrowLeft, Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Edite a taxa de entrega aqui
export const DELIVERY_FEE = 5.00;

export default function Cart() {
  const [, setLocation] = useLocation();
  const { cartItems, updateQuantity, removeItem, subtotal, totalItems } = useCart();

  return (
    <PageTransition className="bg-[#0a0a0a]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 px-6 py-4">
        <div className="max-w-md mx-auto flex items-center">
          <button 
            onClick={() => setLocation('/cardapio')}
            className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-black text-white uppercase tracking-tight ml-2">Meu Pedido</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 pb-40">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-600 mb-6">
              <ShoppingBag size={48} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Carrinho Vazio</h2>
            <p className="text-zinc-500 mb-8 max-w-[250px]">Adicione os melhores hambúrgueres para matar sua fome.</p>
            <Link href="/cardapio">
              <Button size="lg" className="rounded-xl font-bold tracking-wider px-8">
                VER CARDÁPIO
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Items List */}
            <div className="space-y-4">
              <AnimatePresence>
                {cartItems.map((cartItem) => (
                  <motion.div 
                    key={cartItem.item.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex gap-4"
                  >
                    <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0">
                      <img 
                        src={cartItem.item.image} 
                        alt={cartItem.item.name} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <h3 className="text-white font-bold uppercase leading-tight max-w-[150px]">
                          {cartItem.item.name}
                        </h3>
                        <button 
                          onClick={() => removeItem(cartItem.item.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors bg-zinc-950 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-primary font-black">
                          R$ {(cartItem.item.price * cartItem.quantity).toFixed(2).replace('.', ',')}
                        </span>
                        
                        <div className="flex items-center gap-3 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                          <button 
                            onClick={() => updateQuantity(cartItem.item.id, -1)}
                            className="w-7 h-7 flex items-center justify-center bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="font-bold text-white text-sm w-4 text-center">{cartItem.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(cartItem.item.id, 1)}
                            className="w-7 h-7 flex items-center justify-center bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Order Summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-white font-bold uppercase tracking-wider mb-4">Resumo do Pedido</h3>
              
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal ({totalItems} {totalItems === 1 ? 'item' : 'itens'})</span>
                <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
              </div>
              
              <div className="flex justify-between text-zinc-400">
                <span>Taxa de Entrega</span>
                <span className="text-zinc-500 text-sm italic">A calcular no checkout</span>
              </div>
              
              <div className="h-px w-full bg-zinc-800 my-2" />
              
              <div className="flex justify-between items-center">
                <span className="text-white font-bold uppercase tracking-wider text-lg">Subtotal</span>
                <span className="text-primary font-black text-2xl">
                  R$ {subtotal.toFixed(2).replace('.', ',')}
                </span>
              </div>

              <p className="text-zinc-600 text-xs text-center">
                Entrega grátis para Retirada e Comer no local
              </p>
            </div>

            <Link href="/checkout" className="block">
              <Button size="lg" className="w-full min-h-[60px] text-lg font-bold tracking-wider rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform">
                FINALIZAR PEDIDO
              </Button>
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </PageTransition>
  );
}
