import React, { createContext, useContext, useState, useMemo } from 'react';

export interface CartProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
  available: boolean;
}

export interface CartItem {
  item: CartProduct;
  quantity: number;
}

interface CartContextType {
  cartItems: CartItem[];
  addItem: (item: CartProduct) => void;
  removeItem: (itemId: number) => void;
  updateQuantity: (itemId: number, delta: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const addItem = (item: CartProduct) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.item.id === item.id);
      if (existing) {
        return prev.map(i => i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const removeItem = (itemId: number) => {
    setCartItems(prev => prev.filter(i => i.item.id !== itemId));
  };

  const updateQuantity = (itemId: number, delta: number) => {
    setCartItems(prev =>
      prev.map(i => i.item.id === itemId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
        .filter(i => i.quantity > 0)
    );
  };

  const clearCart = () => setCartItems([]);

  const totalItems = useMemo(() => cartItems.reduce((acc, ci) => acc + ci.quantity, 0), [cartItems]);
  const subtotal = useMemo(() => cartItems.reduce((acc, ci) => acc + ci.item.price * ci.quantity, 0), [cartItems]);

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
