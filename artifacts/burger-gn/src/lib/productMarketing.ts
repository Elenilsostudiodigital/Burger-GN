import type { Product } from './api';

export type MarketingBadge =
  | ''
  | 'promotion'
  | 'featured'
  | 'flash'
  | 'new'
  | 'bestseller'
  | 'clube';

export const MARKETING_BADGE_OPTIONS: Array<{ value: MarketingBadge; label: string }> = [
  { value: '', label: 'Automática (conforme flags)' },
  { value: 'promotion', label: '🔥 Promoção' },
  { value: 'featured', label: '⭐ Destaque' },
  { value: 'flash', label: '💥 Oferta Relâmpago' },
  { value: 'new', label: '🆕 Novidade' },
  { value: 'bestseller', label: '📈 Mais Vendido' },
  { value: 'clube', label: '👑 Exclusivo Clube Burger' },
];

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
  return !!(p.isPromoActive && (p.isPromotion || p.isFlashOffer));
}

export function productBadgeText(p: Product): string {
  return (p.badgeLabel || '').trim();
}
