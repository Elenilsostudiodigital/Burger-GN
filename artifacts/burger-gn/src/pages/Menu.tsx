import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { getCategories, getProducts, getExternalLinks, Category, Product, ExternalLink, Addon } from '../lib/api';
import { filterProductsByQuery } from '../lib/homeSections';
import { BottomNav } from '../components/BottomNav';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { PageTransition } from '../components/PageTransition';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { ProductRowCard } from '../components/ProductRowCard';
import { ShoppingCart, ExternalLink as ExternalLinkIcon, Search, X } from 'lucide-react';
import { Link } from 'wouter';

export default function Menu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [search, setSearch] = useState('');
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

  const filteredItems = useMemo(() => {
    if (search.trim()) return filterProductsByQuery(products, search);
    return products.filter(p => p.categorySlug === activeCategory);
  }, [products, activeCategory, search]);

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
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800 px-6 py-4">
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

      <div className="sticky top-[73px] z-30 bg-zinc-950 border-b border-zinc-800">
        <div className="max-w-md mx-auto px-4 pt-3">
          <div className="relative mb-2.5">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar no cardápio..."
              className="w-full h-10 rounded-xl bg-zinc-900 border border-zinc-800 pl-10 pr-10 text-sm text-white placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        {!search && (
          <div className="max-w-md mx-auto px-4 pb-3 flex gap-2.5 overflow-x-auto no-scrollbar snap-x">
            {categories.map(cat => (
              <button
                key={cat.slug}
                onClick={() => {
                  setActiveCategory(cat.slug);
                  document.getElementById('menu-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`snap-start whitespace-nowrap px-4 py-2 rounded-full font-bold text-xs tracking-wider uppercase transition-all ${
                  activeCategory === cat.slug
                    ? 'bg-amber-500 text-zinc-950 shadow-[0_0_15px_rgba(245,158,11,0.35)]'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <main id="menu-list" className="max-w-md mx-auto px-4 py-5 pb-32 scroll-mt-40">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={search || activeCategory}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="space-y-2.5"
            >
              {filteredItems.length === 0 ? (
                <p className="text-zinc-500 text-center py-12">
                  {search ? 'Nenhum produto encontrado.' : 'Nenhum item nesta categoria.'}
                </p>
              ) : (
                filteredItems.map((item, idx) => (
                  <ProductRowCard
                    key={item.id}
                    product={item}
                    index={idx}
                    quantity={quantityForProduct(item.id)}
                    onSelect={setDetailProduct}
                    onQuickAdd={handleQuickAdd}
                    onQuantityChange={handleQuantityChange}
                  />
                ))
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {externalLinks.length > 0 && (
          <div className="mt-8 space-y-2">
            {externalLinks.map(link => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-amber-500 hover:border-amber-500/40 transition-colors text-sm font-bold uppercase tracking-wider"
              >
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
