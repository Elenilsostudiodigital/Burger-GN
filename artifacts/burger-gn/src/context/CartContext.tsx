import React, { createContext, useContext, useState, useMemo } from 'react';
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
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const addItem = (item: CartProduct, options?: AddItemOptions) => {
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
    setCartItems(prev => prev.filter(i => i.lineId !== lineId));
  };

  const updateQuantity = (lineId: string, delta: number) => {
    setCartItems(prev =>
      prev.map(i => i.lineId === lineId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
        .filter(i => i.quantity > 0)
    );
  };

  const clearCart = () => setCartItems([]);

  const lineTotal = (ci: CartItem) => (ci.item.price + ci.selectedAddons.reduce((acc, a) => acc + a.price, 0)) * ci.quantity;

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
