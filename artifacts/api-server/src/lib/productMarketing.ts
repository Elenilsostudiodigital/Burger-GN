/** Shared product promotion helpers (API). */

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
  promoText?: string | null;
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

/** Automatic discount % from original vs promo — never set manually. */
export function calcDiscountPercent(original: number, promo: number): number | null {
  if (!(original > 0) || !(promo >= 0) || promo >= original) return null;
  return Math.round(((original - promo) / original) * 100);
}

export function enrichProductMarketing<T extends ProductMarketingRow>(row: T, now = new Date()) {
  const basePrice = num(row.price) ?? 0;
  const expired = isPromoExpired(row, now);
  const active = !expired && isPromoActiveNow(row, now);
  const original = num(row.promoOriginalPrice) ?? basePrice;
  const promo = num(row.promoPrice);
  const discountPercent =
    active && promo !== null ? calcDiscountPercent(original, promo) : null;
  const savedAmount =
    active && promo !== null && original > promo
      ? Number((original - promo).toFixed(2))
      : null;

  const promoText = String(row.promoText || "").trim();

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
    promoText,
    isPromoActive: active,
    displayPrice: active && promo !== null ? promo.toFixed(2) : basePrice.toFixed(2),
    compareAtPrice: active ? original.toFixed(2) : null,
    /** Percentage badge for menu, e.g. "-20%" — computed only */
    discountPercent,
    discountLabel: discountPercent != null ? `-${discountPercent}%` : null,
    savedAmount,
    /** Prefer promo headline; fallback keeps prior badge labels for legacy rows */
    badgeLabel:
      active && discountPercent != null
        ? `-${discountPercent}%`
        : promoText || (row.isFeatured ? "⭐ Destaque" : ""),
    promoExpired: expired,
  };
}
