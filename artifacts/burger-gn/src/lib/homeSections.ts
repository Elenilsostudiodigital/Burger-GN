import type { Category, Product } from './api';

export interface HomeSection {
  id: string;
  title: string;
  products: Product[];
}

type SectionDef = {
  id: string;
  title: string;
  /** Match category slug/name; product name used as fallback for smash/batata */
  slugIncludes?: string[];
  nameIncludes?: string[];
  productNameIncludes?: string[];
  featured?: boolean;
};

const SECTION_DEFS: SectionDef[] = [
  { id: 'mais-pedidos', title: 'Os Mais Pedidos', featured: true },
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

function productsForDef(def: SectionDef, categories: Category[], products: Product[]): Product[] {
  if (def.featured) {
    const promo = products.filter(p => normalize(p.categorySlug).includes('promocao'));
    if (promo.length > 0) return promo.slice(0, 6);

    const burgerSlugs = categories
      .filter(c => matchesCategory(c, {
        id: 'hamburguer-artesanal',
        title: '',
        slugIncludes: ['hamburguer', 'burger'],
        nameIncludes: ['hamburguer', 'artesanal'],
      }))
      .map(c => c.slug);

    const comboSlugs = categories
      .filter(c => matchesCategory(c, { id: 'combos', title: '', slugIncludes: ['combo'], nameIncludes: ['combo'] }))
      .map(c => c.slug);

    const pool = products.filter(p =>
      (p.categorySlug && (burgerSlugs.includes(p.categorySlug) || comboSlugs.includes(p.categorySlug))) ||
      normalize(p.categoryName).includes('hamburguer') ||
      normalize(p.categoryName).includes('combo')
    );

    const sorted = [...(pool.length ? pool : products)].sort((a, b) => a.displayOrder - b.displayOrder);
    return sorted.slice(0, 6);
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
      def.productNameIncludes!.some(n => normalize(p.name).includes(normalize(n)) || normalize(p.description).includes(normalize(n)))
    );
  }

  return [...list].sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Build home sections from live categories/products. Empty sections are omitted. */
export function buildHomeSections(categories: Category[], products: Product[]): HomeSection[] {
  const usedIds = new Set<number>();
  const sections: HomeSection[] = [];

  for (const def of SECTION_DEFS) {
    let items = productsForDef(def, categories, products);
    if (!def.featured) {
      items = items.filter(p => !usedIds.has(p.id));
    }
    if (items.length === 0) continue;
    if (!def.featured) items.forEach(p => usedIds.add(p.id));
    sections.push({ id: def.id, title: def.title, products: items });
  }

  return sections;
}
