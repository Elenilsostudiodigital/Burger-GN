import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { getCategories, getProducts, getExternalLinks, Category, Product, ExternalLink } from '../lib/api';
import { BottomNav } from '../components/BottomNav';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { PageTransition } from '../components/PageTransition';
import { ShoppingCart, Plus, Minus, Flame, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { Link } from 'wouter';

export default function Menu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { cartItems, addItem, updateQuantity, totalItems } = useCart();

  useEffect(() => {
    Promise.all([getCategories(), getProducts()])
      .then(([cats, prods]) => {
        setCategories(cats);
        setProducts(prods);
        if (cats.length > 0) setActiveCategory(cats[0].slug);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    getExternalLinks().then(setExternalLinks).catch(() => {});
  }, []);

  const filteredItems = products.filter(p => p.categorySlug === activeCategory);

  const cartItemForProduct = (productId: number) =>
    cartItems.find(ci => ci.item.id === productId);

  const handleAdd = (product: Product) => {
    addItem({
      id: product.id,
      name: product.name,
      description: product.description,
      price: parseFloat(product.price),
      image: product.image,
      available: product.available,
    });
  };

  return (
    <PageTransition className="bg-[#0a0a0a]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 px-6 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-amber-500 rounded-full flex items-center justify-center">
              <span className="text-amber-500 font-black text-sm">GN</span>
            </div>
            <h1 className="text-xl font-black text-white uppercase tracking-tight">The Burger GN</h1>
          </div>
          <Link href="/carrinho" className="relative p-2 text-zinc-300 hover:text-amber-500 transition-colors">
            <ShoppingCart size={24} />
            {totalItems > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-zinc-950 rounded-full text-[10px] font-bold flex items-center justify-center"
              >
                {totalItems}
              </motion.div>
            )}
          </Link>
        </div>
      </header>

      {/* Categories */}
      <div className="sticky top-[73px] z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-md mx-auto px-4 py-3 flex gap-3 overflow-x-auto no-scrollbar snap-x">
          {categories.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setActiveCategory(cat.slug)}
              className={`snap-start whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm tracking-wider uppercase transition-all ${
                activeCategory === cat.slug
                  ? 'bg-amber-500 text-zinc-950 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Product List */}
      <main className="max-w-md mx-auto px-4 py-6 pb-32">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {filteredItems.length === 0 ? (
                <p className="text-zinc-500 text-center py-12">Nenhum item nesta categoria.</p>
              ) : (
                filteredItems.map(item => {
                  const cartItem = cartItemForProduct(item.id);
                  const quantity = cartItem?.quantity ?? 0;
                  return (
                    <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex shadow-sm relative">
                      {item.categorySlug === 'promocao' && (
                        <div className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded flex items-center gap-1">
                          <Flame size={12} /> Promo
                        </div>
                      )}
                      <div className="w-1/3 relative">
                        <img src={item.image || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop'} alt={item.name} className="w-full h-full object-cover min-h-[140px]" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-zinc-900" />
                      </div>
                      <div className="w-2/3 p-4 flex flex-col justify-between">
                        <div>
                          <h3 className="text-white font-bold uppercase text-lg leading-tight mb-1">{item.name}</h3>
                          <p className="text-zinc-400 text-xs line-clamp-2 mb-2 leading-relaxed">{item.description}</p>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-amber-500 font-black text-lg">
                            R$ {parseFloat(item.price).toFixed(2).replace('.', ',')}
                          </span>
                          {quantity === 0 ? (
                            <button
                              onClick={() => handleAdd(item)}
                              className="bg-zinc-800 text-amber-500 hover:bg-amber-500 hover:text-zinc-950 p-2 px-3 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors flex items-center gap-1"
                            >
                              <Plus size={16} /> Adicionar
                            </button>
                          ) : (
                            <div className="flex items-center gap-3 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
                              <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 active:scale-95 transition-transform">
                                <Minus size={16} />
                              </button>
                              <span className="font-bold text-white w-4 text-center">{quantity}</span>
                              <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center bg-amber-500 text-zinc-950 rounded-lg hover:brightness-110 active:scale-95 transition-transform">
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
        )}

        {externalLinks.length > 0 && (
          <div className="mt-8 space-y-2">
            {externalLinks.map(link => (
              <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-amber-500 hover:border-amber-500/40 transition-colors text-sm font-bold uppercase tracking-wider">
                <ExternalLinkIcon size={16} /> {link.label}
              </a>
            ))}
          </div>
        )}
      </main>

      <WhatsAppButton />
      <BottomNav />
    </PageTransition>
  );
}
