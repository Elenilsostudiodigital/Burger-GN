import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { menuItems } from '../data/menu';
import { BottomNav } from '../components/BottomNav';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { PageTransition } from '../components/PageTransition';
import { ShoppingCart, Plus, Minus, Flame } from 'lucide-react';
import { Link } from 'wouter';

const CATEGORIES = [
  { id: 'hamburguer', label: 'Hambúrgueres' },
  { id: 'combo', label: 'Combos' },
  { id: 'promocao', label: 'Promoções' },
  { id: 'bebida', label: 'Bebidas' },
  { id: 'adicional', label: 'Adicionais' },
];

export default function Menu() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
  const { cartItems, addItem, updateQuantity, totalItems } = useCart();

  const filteredItems = menuItems.filter(item => item.category === activeCategory);

  return (
    <PageTransition className="bg-[#0a0a0a]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 px-6 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-primary rounded-full flex items-center justify-center">
              <span className="text-primary font-black text-sm">GN</span>
            </div>
            <h1 className="text-xl font-black text-white uppercase tracking-tight">The Burger GN</h1>
          </div>
          <Link href="/carrinho" className="relative p-2 text-zinc-300 hover:text-primary transition-colors">
            <ShoppingCart size={24} />
            {totalItems > 0 && (
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-zinc-950"
              >
                {totalItems}
              </motion.div>
            )}
          </Link>
        </div>
      </header>

      {/* Categories Horizontal Scroll */}
      <div className="sticky top-[73px] z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-md mx-auto px-4 py-3 flex gap-3 overflow-x-auto no-scrollbar snap-x">
          {CATEGORIES.map(category => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`snap-start whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm tracking-wider uppercase transition-all ${
                activeCategory === category.id 
                  ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(201,147,10,0.4)]' 
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product List */}
      <main className="max-w-md mx-auto px-4 py-6 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {filteredItems.length === 0 ? (
              <p className="text-zinc-500 text-center py-12">Nenhum item nesta categoria.</p>
            ) : (
              filteredItems.map(item => {
                const cartItem = cartItems.find(i => i.item.id === item.id);
                const quantity = cartItem?.quantity || 0;

                return (
                  <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex shadow-sm relative">
                    {item.category === 'promocao' && (
                      <div className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded flex items-center gap-1 shadow-lg">
                        <Flame size={12} /> Promo
                      </div>
                    )}
                    
                    <div className="w-1/3 relative">
                      <img 
                        src={item.image} 
                        alt={item.name} 
                        className="w-full h-full object-cover min-h-[140px]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-zinc-900" />
                    </div>
                    
                    <div className="w-2/3 p-4 flex flex-col justify-between">
                      <div>
                        <h3 className="text-white font-bold uppercase text-lg leading-tight mb-1">{item.name}</h3>
                        <p className="text-zinc-400 text-xs line-clamp-2 mb-2 leading-relaxed">{item.description}</p>
                      </div>
                      
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-primary font-black text-lg">
                          R$ {item.price.toFixed(2).replace('.', ',')}
                        </span>
                        
                        {quantity === 0 ? (
                          <button 
                            onClick={() => addItem(item)}
                            className="bg-zinc-800 text-primary hover:bg-primary hover:text-primary-foreground p-2 px-3 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors flex items-center gap-1"
                          >
                            <Plus size={16} /> Adicionar
                          </button>
                        ) : (
                          <div className="flex items-center gap-3 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
                            <button 
                              onClick={() => updateQuantity(item.id, -1)}
                              className="w-8 h-8 flex items-center justify-center bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 active:scale-95 transition-transform"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="font-bold text-white w-4 text-center">{quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.id, 1)}
                              className="w-8 h-8 flex items-center justify-center bg-primary text-primary-foreground rounded-lg hover:brightness-110 active:scale-95 transition-transform"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <WhatsAppButton />
      <BottomNav />
    </PageTransition>
  );
}
