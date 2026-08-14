import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ShoppingCart, ArrowRight, Search, X } from 'lucide-react';
import { getCategories, getProducts, getPopularProducts, getCompanyProfile, Category, Product, Addon, CompanyProfile } from '../lib/api';
import { buildHomeSections, filterProductsByQuery } from '../lib/homeSections';
import { useCart } from '../context/CartContext';
import { BottomNav } from '../components/BottomNav';
import { PageTransition } from '../components/PageTransition';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { ProductRowCard } from '../components/ProductRowCard';
import { ClubeHomeCard } from '../components/ClubeHomeCard';
import { StoreClosedBanner } from '../components/StoreClosedBanner';
import { getSavedClubePhone } from '../lib/clubeCliente';
import { productEffectivePrice } from '../lib/productMarketing';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [popularIds, setPopularIds] = useState<number[]>([]);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [clubeLoggedIn, setClubeLoggedIn] = useState(() => !!getSavedClubePhone());
  const { cartItems, addItem, updateQuantity, totalItems } = useCart();

  useEffect(() => {
    const sync = () => setClubeLoggedIn(!!getSavedClubePhone());
    window.addEventListener('bgn:clube-session-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('bgn:clube-session-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      getCategories(),
      getProducts(),
      getPopularProducts().catch(() => []),
      getCompanyProfile().catch(() => null),
    ])
      .then(([cats, prods, popular, companyProfile]) => {
        setCategories(cats);
        setProducts(prods);
        setPopularIds(popular.map(p => p.productId).filter((id): id is number => typeof id === 'number'));
        setProfile(companyProfile);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const brandName = profile?.name?.trim() || 'The Burger GN';
  const brandMark = profile?.logoUrl?.trim()
    ? null
    : (brandName.match(/GN/i)?.[0] || brandName.slice(0, 2).toUpperCase() || 'GN');
  const bannerUrl =
    profile?.bannerUrl?.trim() ||
    'https://images.unsplash.com/photo-1550547660-d9450f859349?w=1200&h=800&fit=crop';
  const slogan = profile?.slogan?.trim() || 'Muito mais que um hambúrguer.';
  const welcome =
    profile?.menuWelcomeMessage?.trim() ||
    profile?.description?.trim() ||
    'Sabores artesanais, apresentação impecável e o padrão que o pedido merece.';

  const sections = useMemo(
    () => buildHomeSections(categories, products, popularIds),
    [categories, products, popularIds],
  );

  const searchResults = useMemo(
    () => (search.trim() ? filterProductsByQuery(products, search) : []),
    [products, search],
  );

  const quantityForProduct = (productId: number) =>
    cartItems
      .filter(ci => ci.item.id === productId && ci.selectedAddons.length === 0 && !ci.notes)
      .reduce((acc, ci) => acc + ci.quantity, 0);

  const lineIdForSimpleProduct = (productId: number) =>
    cartItems.find(ci => ci.item.id === productId && ci.selectedAddons.length === 0 && !ci.notes)?.lineId;

  const handleQuickAdd = (product: Product) => {
    if (!product.available) return;
    if (product.isClubeExclusive && !clubeLoggedIn) return;
    addItem({
      id: product.id,
      name: product.name,
      description: product.description,
      price: productEffectivePrice(product),
      image: product.image,
      available: product.available,
    });
  };

  const handleModalAdd = (product: Product, addons: Addon[], notes: string, quantity: number) => {
    if (!product.available) return;
    if (product.isClubeExclusive && !clubeLoggedIn) return;
    addItem({
      id: product.id,
      name: product.name,
      description: product.description,
      price: productEffectivePrice(product),
      image: product.image,
      available: product.available,
    }, { addons, notes, quantity });
  };

  const handleQuantityChange = (productId: number, delta: number) => {
    const lineId = lineIdForSimpleProduct(productId);
    if (lineId) updateQuantity(lineId, delta);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <PageTransition className="bg-[#0a0a0a]">
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800/80 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {profile?.logoUrl?.trim() ? (
              <img
                src={profile.logoUrl}
                alt=""
                className="w-9 h-9 rounded-full object-cover border-2 border-amber-500"
              />
            ) : (
              <div className="w-9 h-9 border-2 border-amber-500 rounded-full flex items-center justify-center shadow-[0_0_18px_rgba(245,158,11,0.25)]">
                <span className="text-amber-500 font-black text-xs tracking-tight">{brandMark}</span>
              </div>
            )}
            <span className="text-white font-black uppercase tracking-tight text-sm">{brandName}</span>
          </div>
          <Link href="/carrinho" className="relative p-2 text-zinc-300 hover:text-amber-500 transition-colors">
            <ShoppingCart size={22} />
            {totalItems > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-amber-500 text-zinc-950 rounded-full text-[10px] font-bold flex items-center justify-center"
              >
                {totalItems}
              </motion.div>
            )}
          </Link>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-3 space-y-3">
        <StoreClosedBanner />
        <ClubeHomeCard />
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{ backgroundImage: `url('${bannerUrl.replace(/'/g, "%27")}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-[#0a0a0a]/85 to-[#0a0a0a]" />
        <div className="relative max-w-md mx-auto px-5 pt-10 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            <p className="text-amber-500 text-xs font-bold uppercase tracking-[0.22em]">
              {brandName}
            </p>
            <h1 className="font-display text-white text-[2.65rem] sm:text-5xl leading-[0.95] tracking-wide uppercase">
              {slogan}
              {!profile?.slogan?.trim() ? (
                <span className="block text-amber-500 mt-1">Uma experiência de verdade.</span>
              ) : null}
            </h1>
            <p className="text-zinc-400 text-sm leading-relaxed max-w-[300px]">
              {welcome}
            </p>
            {(profile?.displayOpenDays || profile?.displayHoursText) ? (
              <p className="text-zinc-500 text-xs">
                {[profile.displayOpenDays, profile.displayHoursText].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <div className="flex gap-3 pt-2">
              <Link href="/cardapio" className="flex-1">
                <Button size="lg" className="w-full h-12 rounded-xl font-bold tracking-wider shadow-lg shadow-amber-500/20">
                  Pedir agora
                </Button>
              </Link>
              <button
                type="button"
                onClick={() => sections[0] && scrollToSection(sections[0].id)}
                className="h-12 px-4 rounded-xl border border-zinc-700 bg-zinc-950/50 text-zinc-200 text-sm font-bold uppercase tracking-wider hover:border-zinc-500 transition-colors inline-flex items-center gap-1.5"
              >
                Ver menu <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Search + section chips */}
      <div className="sticky top-[57px] z-30 bg-[#0a0a0a] border-b border-zinc-800/70">
        <div className="max-w-md mx-auto px-4 pt-3 pb-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar produtos..."
              className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-800 pl-10 pr-10 text-sm text-white placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        {!search && sections.length > 0 && (
          <div className="max-w-md mx-auto px-4 py-2.5 flex gap-2 overflow-x-auto no-scrollbar">
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className="snap-start whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-bold uppercase tracking-wider bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white hover:border-amber-500/40 transition-colors"
              >
                {section.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="max-w-md mx-auto px-4 pt-6 pb-8 space-y-9">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : search.trim() ? (
          <section className="space-y-3">
            <h2 className="text-white font-black text-lg tracking-tight">
              Resultados {searchResults.length > 0 ? `(${searchResults.length})` : ''}
            </h2>
            {searchResults.length === 0 ? (
              <p className="text-zinc-500 text-sm py-10 text-center">Nenhum produto encontrado para “{search}”.</p>
            ) : (
              <div className="space-y-2.5">
                {searchResults.map((product, idx) => (
                  <ProductRowCard
                    key={`search-${product.id}`}
                    product={product}
                    index={idx}
                    quantity={quantityForProduct(product.id)}
                    clubeLoggedIn={clubeLoggedIn}
                    onSelect={setDetailProduct}
                    onQuickAdd={handleQuickAdd}
                    onQuantityChange={handleQuantityChange}
                  />
                ))}
              </div>
            )}
          </section>
        ) : sections.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-zinc-500">Cardápio em atualização.</p>
            <Link href="/cardapio">
              <Button className="rounded-xl font-bold tracking-wider">Abrir cardápio</Button>
            </Link>
          </div>
        ) : (
          sections.map((section, sIdx) => (
            <motion.section
              key={section.id}
              id={`section-${section.id}`}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: sIdx * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="scroll-mt-40 space-y-3"
            >
              <div className="flex items-end justify-between gap-3 px-0.5">
                <h2 className="text-white font-black text-lg tracking-tight">{section.title}</h2>
                <Link
                  href="/cardapio"
                  className="text-amber-500 text-xs font-bold uppercase tracking-wider hover:text-amber-400 transition-colors"
                >
                  Ver tudo
                </Link>
              </div>
              <div className="space-y-2.5">
                {section.products.map((product, idx) => (
                  <ProductRowCard
                    key={`${section.id}-${product.id}`}
                    product={product}
                    index={idx}
                    quantity={quantityForProduct(product.id)}
                    clubeLoggedIn={clubeLoggedIn}
                    onSelect={setDetailProduct}
                    onQuickAdd={handleQuickAdd}
                    onQuantityChange={handleQuantityChange}
                  />
                ))}
              </div>
            </motion.section>
          ))
        )}
      </main>

      <ProductDetailModal
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
        onAdd={handleModalAdd}
        clubeLoggedIn={clubeLoggedIn}
      />
      <BottomNav />
    </PageTransition>
  );
}
