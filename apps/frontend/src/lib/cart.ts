import { useEffect, useState } from 'react';

export const CART_KEY = 'aiMerchCart';

export type FlatCartItem = {
  id?: string;
  productId: string;
  productName: string;
  price: number;
  assetId?: string;
  assetTitle?: string;
  mockupImageUrl?: string | null;
  quantity: number;
  size?: string | null;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function readCart(): FlatCartItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCart(items: FlatCartItem[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('cart-updated'));
}

export function addToCart(
  item: Omit<FlatCartItem, 'quantity'> & { quantity?: number },
): void {
  const existing = readCart();
  const quantity = item.quantity ?? 1;

  const matchIdx = existing.findIndex(
    (i) =>
      i.productId === item.productId &&
      (i.size ?? null) === (item.size ?? null) &&
      (i.assetId ?? null) === (item.assetId ?? null),
  );

  let updated: FlatCartItem[];
  if (matchIdx >= 0) {
    updated = existing.map((i, idx) =>
      idx === matchIdx ? { ...i, quantity: i.quantity + quantity } : i,
    );
  } else {
    updated = [...existing, { ...item, quantity }];
  }

  writeCart(updated);
}

export function removeFromCart(
  productId: string,
  opts: { assetId?: string | null } = {},
): void {
  const assetId = opts.assetId ?? null;
  const existing = readCart();
  const updated = existing.filter((item) => {
    if (item.productId !== productId) return true;
    if (assetId !== null && (item.assetId ?? null) !== assetId) return true;
    if (assetId === null && item.assetId) return true;
    return false;
  });
  writeCart(updated);
}

export function getCartCount(): number {
  return readCart().reduce((total, item) => total + (item.quantity || 0), 0);
}

export function useCartCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(getCartCount());
    const update = () => setCount(getCartCount());
    window.addEventListener('cart-updated', update);
    return () => window.removeEventListener('cart-updated', update);
  }, []);

  return count;
}

const CART_SHEET_EVENT = 'cart-sheet-toggle';
let cartSheetOpen = false;

export function setCartSheetOpen(open: boolean): void {
  cartSheetOpen = open;
  if (isBrowser()) window.dispatchEvent(new Event(CART_SHEET_EVENT));
}

export function useCartSheetOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(cartSheetOpen);

  useEffect(() => {
    const update = () => setOpen(cartSheetOpen);
    window.addEventListener(CART_SHEET_EVENT, update);
    return () => window.removeEventListener(CART_SHEET_EVENT, update);
  }, []);

  return [open, setCartSheetOpen];
}
