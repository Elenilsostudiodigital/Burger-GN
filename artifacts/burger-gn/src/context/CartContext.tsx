import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import type { Addon } from '../lib/api';

export interface CartProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
  available: boolean;
}

export interface CartItem {
  lineId: string;
  item: CartProduct;
  quantity: number;
  selectedAddons: Addon[];
  notes: string;
}

interface AddItemOptions {
  addons?: Addon[];
  notes?: string;
  quantity?: number;
}

function makeLineId(productId: number, addons: Addon[], notes: string): string {
  const addonsKey = addons.map(a => a.name).sort().join('|');
  return `${productId}::${addonsKey}::${notes.trim()}`;
}

const CART_STORAGE_KEY = 'bgn_cart_v1';
const LAST_ORDER_SESSION_KEY = 'lastOrder';

function isValidCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const o = value as Partial<CartItem>;
  if (typeof o.lineId !== 'string' || !o.lineId) return false;
  if (!o.item || typeof o.item !== 'object') return false;
  if (typeof o.item.id !== 'number' || typeof o.item.name !== 'string') return false;
  if (typeof o.item.price !== 'number') return false;
  if (typeof o.quantity !== 'number' || o.quantity <= 0) return false;
  if (!Array.isArray(o.selectedAddons)) return false;
  if (typeof o.notes !== 'string') return false;
  return true;
}

/** Load cart from localStorage (PWA / refresh safe). Invalid data → empty. */
export function loadCartFromStorage(): CartItem[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidCartItem);
  } catch {
    return [];
  }
}

export function persistCartToStorage(items: CartItem[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!items.length) {
      localStorage.removeItem(CART_STORAGE_KEY);
      return;
    }
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Remove cart persistence + leftover checkout lastOrder. Does not touch Meu Pedido / clube / presence. */
export function wipeCartSessionResidue(): void {
  persistCartToStorage([]);
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(LAST_ORDER_SESSION_KEY);
  } catch {
    /* private mode — ignore */
  }
}

interface CartContextType {
  cartItems: CartItem[];
  addItem: (item: CartProduct, options?: AddItemOptions) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, delta: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>(() => loadCartFromStorage());

  useEffect(() => {
    persistCartToStorage(cartItems);
  }, [cartItems]);

  const addItem = (item: CartProduct, options?: AddItemOptions) => {
    if (!item.available) return;
    const selectedAddons = options?.addons ?? [];
    const notes = options?.notes ?? '';
    const qtyToAdd = options?.quantity ?? 1;
    const lineId = makeLineId(item.id, selectedAddons, notes);
    setCartItems(prev => {
      const existing = prev.find(i => i.lineId === lineId);
      if (existing) {
        return prev.map(i => i.lineId === lineId ? { ...i, quantity: i.quantity + qtyToAdd } : i);
      }
      return [...prev, { lineId, item, quantity: qtyToAdd, selectedAddons, notes }];
    });
  };

  const removeItem = (lineId: string) => {
    setCartItems(prev => {
      const next = prev.filter(i => i.lineId !== lineId);
      if (next.length === 0) wipeCartSessionResidue();
      return next;
    });
  };

  const updateQuantity = (lineId: string, delta: number) => {
    setCartItems(prev => {
      const next = prev
        .map(i => i.lineId === lineId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
        .filter(i => i.quantity > 0);
      if (next.length === 0) wipeCartSessionResidue();
      return next;
    });
  };

  const clearCart = () => {
    setCartItems([]);
    wipeCartSessionResidue();
  };

  const lineTotal = (ci: CartItem) => {
    const addons = Array.isArray(ci.selectedAddons) ? ci.selectedAddons : [];
    return (Number(ci.item.price) + addons.reduce((acc, a) => acc + (Number(a.price) || 0), 0)) * ci.quantity;
  };

  const totalItems = useMemo(() => cartItems.reduce((acc, ci) => acc + ci.quantity, 0), [cartItems]);
  const subtotal = useMemo(() => cartItems.reduce((acc, ci) => acc + lineTotal(ci), 0), [cartItems]);

  return (
    <CartContext.Provider value={{ cartItems, addItem, removeItem, updateQuantity, clearCart, totalItems, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
