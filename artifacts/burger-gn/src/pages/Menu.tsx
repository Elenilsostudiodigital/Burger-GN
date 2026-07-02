import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { getCategories, getProducts, getExternalLinks, Category, Product, ExternalLink, Addon } from '../lib/api';
import { BottomNav } from '../components/BottomNav';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { PageTransition } from '../components/PageTransition';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { ShoppingCart, Plus, Minus, Flame, ExternalLink as ExternalLinkIcon, PlayCircle, ListChecks } from 'lucide-react';
import { Link } from 'wouter';

export default function Menu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
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

  const quantityForProduct = (productId: number) =>
    cartItems.filter(ci => ci.item.id === productId && ci.selectedAddons.length === 0 && !ci.notes)
      .reduce((acc, ci) => acc + ci.quantity, 0);

  const lineIdForSimpleProduct = (productId: number) =>
    cartItems.find(ci => ci.item.id === productId && ci.selectedAddons.length === 0 && !ci.notes)?.lineId;

  const handleQuickAdd = (product: Product) => {
    addItem({
      id: product.id,
      name: product.name,
      description: product.description,
      price: parseFloat(product.price),
      image: product.image,
      available: product.available,
    });
  };

  const handleModalAdd = (product: Product, addons: Addon[], notes: string, quantity: number) => {
    addItem({
      id: product.id,
      name: product.name,
      description: product.description,
      price: parseFloat(product.price),
      image: product.image,
      available: product.available,
    }, { addons, notes, quantity });
  };

  const handleQuantityChange = (productId: number, delta: number) => {
    const lineId = lineIdForSimpleProduct(productId);
    if (lineId) updateQuantity(lineId, delta);
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
              className="grid grid-cols-2 gap-3"
            >
              {filteredItems.length === 0 ? (
                <p className="text-zinc-500 text-center py-12 col-span-2">Nenhum item nesta categoria.</p>
              ) : (
                filteredItems.map((item, idx) => {
                  const quantity = quantityForProduct(item.id);
                  const hasCustomization = item.ingredients.length > 0 || item.addons.length > 0;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: idx * 0.03 }}
                      onClick={() => setDetailProduct(item)}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm relative flex flex-col cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      {item.categorySlug === 'promocao' && (
                        <div className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded flex items-center gap-1">
                          <Flame size={12} /> Promo
                        </div>
                      )}
                      {item.videoUrl && (
                        <div className="absolute top-2 right-2 z-10 bg-black/60 backdrop-blur text-white p-1 rounded-full">
                          <PlayCircle size={16} />
                        </div>
                      )}
                      <div className="relative aspect-square w-full">
                        <img
                          src={item.image || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop'}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-zinc-900 to-transparent" />
                      </div>
                      <div className="p-3 flex flex-col gap-1.5 flex-1">
                        <h3 className="text-white font-bold uppercase text-sm leading-tight line-clamp-2">{item.name}</h3>
                        {hasCustomization && (
                          <span className="flex items-center gap-1 text-zinc-500 text-[10px]">
                            <ListChecks size={11} /> Personalizável
                          </span>
                        )}
                        <div className="mt-auto flex items-center justify-between pt-1">
                          <span className="text-amber-500 font-black text-base">
                            R$ {parseFloat(item.price).toFixed(2).replace('.', ',')}
                          </span>
                          {quantity === 0 ? (
                            <button
                              onClick={e => { e.stopPropagation(); handleQuickAdd(item); }}
                              className="w-8 h-8 flex items-center justify-center bg-zinc-800 text-amber-500 hover:bg-amber-500 hover:text-zinc-950 rounded-lg transition-colors"
                            >
                              <Plus size={16} />
                            </button>
                          ) : (
                            <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                              <button onClick={() => handleQuantityChange(item.id, -1)} className="w-6 h-6 flex items-center justify-center bg-zinc-800 text-white rounded hover:bg-zinc-700 active:scale-95 transition-transform">
                                <Minus size={12} />
                              </button>
                              <span className="font-bold text-white w-4 text-center text-xs">{quantity}</span>
                              <button onClick={() => handleQuantityChange(item.id, 1)} className="w-6 h-6 flex items-center justify-center bg-amber-500 text-zinc-950 rounded hover:brightness-110 active:scale-95 transition-transform">
                                <Plus size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
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

      <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} onAdd={handleModalAdd} />

      <WhatsAppButton />
      <BottomNav />
    </PageTransition>
  );
}
