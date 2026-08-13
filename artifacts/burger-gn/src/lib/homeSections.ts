import type { Category, Product } from './api';

export interface HomeSection {
  id: string;
  title: string;
  products: Product[];
}

type SectionDef = {
  id: string;
  title: string;
  slugIncludes?: string[];
  nameIncludes?: string[];
  productNameIncludes?: string[];
  featured?: boolean;
  highlight?: boolean;
  newest?: boolean;
};

const SECTION_DEFS: SectionDef[] = [
  { id: 'mais-pedidos', title: 'Os Mais Pedidos', featured: true },
  { id: 'destaques', title: 'Em Destaque', highlight: true },
  { id: 'novos', title: 'Novidades', newest: true },
  { id: 'combos', title: 'Combos', slugIncludes: ['combo'], nameIncludes: ['combo'] },
  {
    id: 'hamburguer-artesanal',
    title: 'Hambúrguer Artesanal',
    slugIncludes: ['hamburguer', 'hamburguer-artesanal', 'burger'],
    nameIncludes: ['hambúrguer', 'hamburguer', 'artesanal'],
  },
  {
    id: 'smash',
    title: 'Smash Burgers',
    slugIncludes: ['smash'],
    nameIncludes: ['smash'],
    productNameIncludes: ['smash'],
  },
  {
    id: 'batatas',
    title: 'Batatas',
    slugIncludes: ['batata', 'acompanhamento', 'porcao', 'porção'],
    nameIncludes: ['batata', 'acompanhamento', 'porção', 'porcao'],
    productNameIncludes: ['batata'],
  },
  {
    id: 'bebidas',
    title: 'Bebidas',
    slugIncludes: ['bebida', 'drink'],
    nameIncludes: ['bebida'],
  },
];

function normalize(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchesCategory(cat: Category, def: SectionDef) {
  const slug = normalize(cat.slug);
  const name = normalize(cat.name);
  return (
    (def.slugIncludes || []).some(s => slug.includes(normalize(s))) ||
    (def.nameIncludes || []).some(s => name.includes(normalize(s)))
  );
}

function productsForDef(
  def: SectionDef,
  categories: Category[],
  products: Product[],
  popularIds: number[],
): Product[] {
  if (def.featured) {
    const bestsellers = products.filter(p => p.isBestseller);
    if (bestsellers.length > 0) return bestsellers.slice(0, 6);
    if (popularIds.length > 0) {
      const map = new Map(products.map(p => [p.id, p]));
      return popularIds.map(id => map.get(id)).filter((p): p is Product => !!p).slice(0, 6);
    }
    const promo = products.filter(p => p.isPromoActive || normalize(p.categorySlug).includes('promocao'));
    if (promo.length > 0) return promo.slice(0, 6);
    return [...products].sort((a, b) => a.displayOrder - b.displayOrder).slice(0, 6);
  }

  if (def.highlight) {
    const featured = products.filter(p => p.isFeatured);
    if (featured.length > 0) return featured.slice(0, 6);
    const promo = products.filter(p => p.isPromoActive || normalize(p.categorySlug).includes('promocao'));
    if (promo.length > 0) return promo.slice(0, 6);
    return [...products].sort((a, b) => a.displayOrder - b.displayOrder).slice(0, 4);
  }

  if (def.newest) {
    const news = products.filter(p => p.isNew);
    if (news.length > 0) return news.slice(0, 6);
    return [...products].sort((a, b) => b.id - a.id).slice(0, 6);
  }

  const matchedCats = categories.filter(c => matchesCategory(c, def));
  const slugs = new Set(matchedCats.map(c => c.slug));

  let list = products.filter(p =>
    (p.categorySlug && slugs.has(p.categorySlug)) ||
    matchedCats.some(c => c.id === p.categoryId) ||
    (def.nameIncludes || []).some(n => normalize(p.categoryName).includes(normalize(n)))
  );

  if (list.length === 0 && def.productNameIncludes?.length) {
    list = products.filter(p =>
      def.productNameIncludes!.some(n =>
        normalize(p.name).includes(normalize(n)) || normalize(p.description).includes(normalize(n))
      )
    );
  }

  return [...list].sort((a, b) => a.displayOrder - b.displayOrder);
}

export function buildHomeSections(
  categories: Category[],
  products: Product[],
  popularIds: number[] = [],
): HomeSection[] {
  const sections: HomeSection[] = [];

  const promos = products.filter(p => p.isPromoActive && (p.isPromotion || p.isFlashOffer));
  if (promos.length > 0) {
    sections.push({
      id: 'promocoes-do-dia',
      title: '🔥 Promoções do Dia',
      products: [...promos].sort((a, b) => a.displayOrder - b.displayOrder),
    });
  }

  for (const def of SECTION_DEFS) {
    const items = productsForDef(def, categories, products, popularIds);
    if (items.length === 0) continue;
    // Avoid duplicating promo-of-day items at the top of "destaques"
    if (def.id === 'destaques' && promos.length > 0) {
      const filtered = items.filter(p => !promos.some(pr => pr.id === p.id));
      if (filtered.length === 0) continue;
      sections.push({ id: def.id, title: def.title, products: filtered });
      continue;
    }
    sections.push({ id: def.id, title: def.title, products: items });
  }

  return sections;
}

export function filterProductsByQuery(products: Product[], query: string): Product[] {
  const q = normalize(query.trim());
  if (!q) return products;
  return products.filter(p =>
    normalize(p.name).includes(q) ||
    normalize(p.description).includes(q) ||
    normalize(p.categoryName).includes(q)
  );
}
