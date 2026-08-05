import React from 'react';
import { Link, useLocation } from 'wouter';
import { Home, UtensilsCrossed, ShoppingCart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { motion, AnimatePresence } from 'framer-motion';

export function BottomNav() {
  const [location] = useLocation();
  const { totalItems } = useCart();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 px-6 py-3 pb-safe">
      <div className="max-w-md mx-auto flex justify-between items-center">
        
        <Link href="/" className="flex flex-col items-center gap-1 group">
          <div className={`p-2 rounded-xl transition-colors ${location === '/' ? 'text-primary' : 'text-zinc-500'}`}>
            <Home size={24} strokeWidth={location === '/' ? 2.5 : 2} />
          </div>
          <span className={`text-[10px] uppercase font-bold tracking-wider ${location === '/' ? 'text-primary' : 'text-zinc-500'}`}>
            Casa
          </span>
        </Link>

        <Link href="/cardapio" className="flex flex-col items-center gap-1 group">
          <div className={`p-2 rounded-xl transition-colors ${location === '/cardapio' ? 'text-primary' : 'text-zinc-500'}`}>
            <UtensilsCrossed size={24} strokeWidth={location === '/cardapio' ? 2.5 : 2} />
          </div>
          <span className={`text-[10px] uppercase font-bold tracking-wider ${location === '/cardapio' ? 'text-primary' : 'text-zinc-500'}`}>
            Cardápio
          </span>
        </Link>

        <Link href="/carrinho" className="flex flex-col items-center gap-1 group relative">
          <div className={`p-2 rounded-xl transition-colors ${location === '/carrinho' ? 'text-primary' : 'text-zinc-500'}`}>
            <ShoppingCart size={24} strokeWidth={location === '/carrinho' ? 2.5 : 2} />
            <AnimatePresence>
              {totalItems > 0 && (
                <motion.div 
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  key={totalItems}
                  className="absolute top-1 right-2 w-5 h-5 bg-primary text-primary-foreground rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-zinc-950"
                >
                  {totalItems}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <span className={`text-[10px] uppercase font-bold tracking-wider ${location === '/carrinho' ? 'text-primary' : 'text-zinc-500'}`}>
            Carrinho
          </span>
        </Link>

      </div>
    </div>
  );
}
