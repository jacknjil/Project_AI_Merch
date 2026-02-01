'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Product } from '@/lib/types';

export interface CartItem {
  product: Product;
  quantity: number;
  assetId?: string | null; // For customized items
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, assetId?: string | null) => void;
  removeItem: (productId: string, assetId?: string | null) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('ai_merch_cart');
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (e) {
        console.error('Failed to parse cart', e);
      }
    }
    setIsInitialized(true);
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('ai_merch_cart', JSON.stringify(items));
    }
  }, [items, isInitialized]);

  const addItem = (product: Product, quantity = 1, assetId: string | null = null) => {
    setItems((prev) => {
      // Check if item exists (matching product ID and asset ID)
      const existingParams = assetId 
        ? (item: CartItem) => item.product.id === product.id && item.assetId === assetId
        : (item: CartItem) => item.product.id === product.id && !item.assetId;

      const existingItemIndex = prev.findIndex(existingParams);

      if (existingItemIndex >= 0) {
        const newItems = [...prev];
        newItems[existingItemIndex].quantity += quantity;
        return newItems;
      }

      return [...prev, { product, quantity, assetId }];
    });
    setIsOpen(true); // Open cart when adding item
  };

  const removeItem = (productId: string, assetId: string | null = null) => {
    setItems((prev) => prev.filter(item => {
      if (item.product.id !== productId) return true;
      // If deleting a specific variant
      if (assetId !== null && item.assetId !== assetId) return true;
      // If deleting a non-customized item but this one is customized
      if (assetId === null && item.assetId) return true;
      
      return false;
    }));
  };

  const clearCart = () => {
    setItems([]);
  };

  const cartCount = items.reduce((total, item) => total + item.quantity, 0);
  
  const cartTotal = items.reduce((total, item) => {
    const price = item.product.price ?? item.product.base_price ?? 0;
    return total + (price * item.quantity);
  }, 0);

  return (
    <CartContext.Provider value={{ 
      items, 
      addItem, 
      removeItem, 
      clearCart, 
      cartCount, 
      cartTotal,
      isOpen,
      setIsOpen
    }}>
      {children}
    </CartContext.Provider>
  );
}
