/** Shared product marketing helpers (API). */

export type MarketingBadge =
  | ""
  | "promotion"
  | "featured"
  | "flash"
  | "new"
  | "bestseller"
  | "clube";

export const MARKETING_BADGE_LABELS: Record<Exclude<MarketingBadge, "">, string> = {
  promotion: "🔥 Promoção",
  featured: "⭐ Destaque",
  flash: "💥 Oferta Relâmpago",
  new: "🆕 Novidade",
  bestseller: "📈 Mais Vendido",
  clube: "👑 Exclusivo Clube Burger",
};

export type ProductMarketingRow = {
  price: string | number;
  isFeatured?: boolean | null;
  isPromotion?: boolean | null;
  isBestseller?: boolean | null;
  isNew?: boolean | null;
  isFlashOffer?: boolean | null;
  isClubeExclusive?: boolean | null;
  promoOriginalPrice?: string | number | null;
  promoPrice?: string | number | null;
  promoStartsAt?: Date | string | null;
  promoEndsAt?: Date | string | null;
  marketingBadge?: string | null;
};

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when promotion window is active and promo price is set. */
export function isPromoActiveNow(row: ProductMarketingRow, now = new Date()): boolean {
  if (!row.isPromotion) return false;
  const promo = num(row.promoPrice);
  if (promo === null || promo < 0) return false;
  const start = asDate(row.promoStartsAt);
  const end = asDate(row.promoEndsAt);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

/** Expired promotion that should auto-revert to normal price. */
export function isPromoExpired(row: ProductMarketingRow, now = new Date()): boolean {
  if (!row.isPromotion) return false;
  const end = asDate(row.promoEndsAt);
  return !!(end && now > end);
}

export function resolveBadge(row: ProductMarketingRow): string {
  const raw = (row.marketingBadge || "").trim() as MarketingBadge;
  if (raw && MARKETING_BADGE_LABELS[raw as Exclude<MarketingBadge, "">]) {
    return MARKETING_BADGE_LABELS[raw as Exclude<MarketingBadge, "">];
  }
  if (row.isClubeExclusive) return MARKETING_BADGE_LABELS.clube;
  if (row.isFlashOffer) return MARKETING_BADGE_LABELS.flash;
  if (row.isPromotion && isPromoActiveNow(row)) return MARKETING_BADGE_LABELS.promotion;
  if (row.isFeatured) return MARKETING_BADGE_LABELS.featured;
  if (row.isNew) return MARKETING_BADGE_LABELS.new;
  if (row.isBestseller) return MARKETING_BADGE_LABELS.bestseller;
  return "";
}

export function enrichProductMarketing<T extends ProductMarketingRow>(row: T, now = new Date()) {
  const basePrice = num(row.price) ?? 0;
  const expired = isPromoExpired(row, now);
  const active = !expired && isPromoActiveNow(row, now);
  const original = num(row.promoOriginalPrice) ?? basePrice;
  const promo = num(row.promoPrice);

  return {
    isFeatured: !!row.isFeatured,
    isPromotion: !!row.isPromotion && !expired,
    isBestseller: !!row.isBestseller,
    isNew: !!row.isNew,
    isFlashOffer: !!row.isFlashOffer,
    isClubeExclusive: !!row.isClubeExclusive,
    promoOriginalPrice:
      row.promoOriginalPrice != null && row.promoOriginalPrice !== ""
        ? String(row.promoOriginalPrice)
        : null,
    promoPrice: row.promoPrice != null && row.promoPrice !== "" ? String(row.promoPrice) : null,
    promoStartsAt: row.promoStartsAt
      ? (row.promoStartsAt instanceof Date
          ? row.promoStartsAt.toISOString()
          : String(row.promoStartsAt))
      : null,
    promoEndsAt: row.promoEndsAt
      ? (row.promoEndsAt instanceof Date ? row.promoEndsAt.toISOString() : String(row.promoEndsAt))
      : null,
    marketingBadge: (row.marketingBadge || "") as string,
    isPromoActive: active,
    displayPrice: active && promo !== null ? promo.toFixed(2) : basePrice.toFixed(2),
    compareAtPrice: active ? original.toFixed(2) : null,
    badgeLabel: resolveBadge({ ...row, isPromotion: !!row.isPromotion && !expired }),
    promoExpired: expired,
  };
}

export const PRODUCT_MARKETING_SELECT = {
  isFeatured: true as const,
  isPromotion: true as const,
  isBestseller: true as const,
  isNew: true as const,
  isFlashOffer: true as const,
  isClubeExclusive: true as const,
  promoOriginalPrice: true as const,
  promoPrice: true as const,
  promoStartsAt: true as const,
  promoEndsAt: true as const,
  marketingBadge: true as const,
};
