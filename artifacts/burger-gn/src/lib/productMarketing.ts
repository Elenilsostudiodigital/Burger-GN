import type { Product } from './api';

export const PROMO_TEXT_SUGGESTIONS = [
  'Descontão $$$',
  'Oferta da Semana',
  'Leve 2 Pague 1',
  'Promoção Imperdível',
  'Oferta Relâmpago',
] as const;

/** Automatic discount % — never typed manually. */
export function calcDiscountPercent(original: number, promo: number): number | null {
  if (!(original > 0) || !(promo >= 0) || promo >= original) return null;
  return Math.round(((original - promo) / original) * 100);
}

export function calcSavedAmount(original: number, promo: number): number | null {
  if (!(original > promo) || !(promo >= 0)) return null;
  return Number((original - promo).toFixed(2));
}

export function productEffectivePrice(p: Product): number {
  if (p.isPromoActive && p.displayPrice) {
    const n = parseFloat(String(p.displayPrice));
    if (Number.isFinite(n)) return n;
  }
  const n = parseFloat(String(p.price));
  return Number.isFinite(n) ? n : 0;
}

export function formatBrl(value: number | string): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')}`;
}

export function isPromoOfTheDay(p: Product): boolean {
  return !!(p.isPromoActive && p.isPromotion);
}

export function productDiscountLabel(p: Product): string {
  if (p.discountLabel) return p.discountLabel;
  if (typeof p.discountPercent === 'number') return `-${p.discountPercent}%`;
  return '';
}

export function productPromoHeadline(p: Product): string {
  return (p.promoText || '').trim();
}
