'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { readCart, writeCart, type FlatCartItem } from '@/lib/cart';

type CartItem = FlatCartItem;

function normalizeItems(raw: CartItem[]): CartItem[] {
  return raw.map((item) => ({
    ...item,
    quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
  }));
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    setItems(normalizeItems(readCart()));
    setLoading(false);
  }, []);

  useEffect(() => {
    const onCartUpdated = () => setItems(normalizeItems(readCart()));
    window.addEventListener('cart-updated', onCartUpdated);
    return () => window.removeEventListener('cart-updated', onCartUpdated);
  }, []);

  function saveCart(next: CartItem[]) {
    setItems(next);
    writeCart(next);
  }

  function handleClearCart() {
    saveCart([]);
  }

  function handleRemoveItem(index: number) {
    saveCart(items.filter((_, i) => i !== index));
  }

  function handleQuantityChange(index: number, delta: number) {
    const next = items.map((item, i) => {
      if (i !== index) return item;
      return { ...item, quantity: Math.max(1, item.quantity + delta) };
    });
    saveCart(next);
  }

  async function handleCheckout() {
    setCheckoutError(null);
    setCheckingOut(true);
    try {
      const payload = {
        userId: 'anon',
        items: items.map((item, index) => ({
          id: `${Date.now()}-${index}`,
          assetId: item.assetId ?? '',
          productId: item.productId,
          assetTitle: item.assetTitle ?? 'Untitled design',
          productName: item.productName ?? 'Product',
          quantity: item.quantity,
          size: item.size,
        })),
      };

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Checkout failed (${res.status})`);
      if (!data?.url) throw new Error('Stripe session URL missing from response');

      window.location.href = data.url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Checkout failed';
      setCheckoutError(msg);
      setCheckingOut(false);
    }
  }

  const total = items.reduce((sum, item) => {
    const p = typeof item.price === 'number' && !Number.isNaN(item.price) ? item.price : 0;
    return sum + p * item.quantity;
  }, 0);

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: '#020617', color: '#e5e7eb', padding: 24 }}>
        <h1>Cart</h1>
        <p>Loading cart…</p>
      </main>
    );
  }

  if (!items.length) {
    return (
      <main style={{ minHeight: '100vh', background: '#020617', color: '#e5e7eb', padding: 24 }}>
        <h1>Cart</h1>
        <p style={{ color: '#9ca3af' }}>Your cart is empty.</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#e5e7eb', padding: 24 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: 960,
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0 }}>Cart</h1>
        <button
          onClick={handleClearCart}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #ef4444',
            background: '#111827',
            color: '#fecaca',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Clear cart
        </button>
      </header>

      <section style={{ maxWidth: 960, marginBottom: 24 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
            gap: 24,
          }}
        >
          {/* Items */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
            {items.map((item, index) => {
              const priceNumber =
                typeof item.price === 'number' && !Number.isNaN(item.price)
                  ? item.price
                  : null;
              const lineTotal = priceNumber !== null ? priceNumber * item.quantity : null;

              return (
                <article
                  key={index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px minmax(0, 1fr)',
                    gap: 16,
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid #1f2937',
                    background: '#020617',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      position: 'relative',
                      borderRadius: 8,
                      border: '1px solid #374151',
                      background: '#020617',
                      overflow: 'hidden',
                    }}
                  >
                    {item.mockupImageUrl ? (
                      <Image
                        src={item.mockupImageUrl}
                        alt={item.assetTitle ?? item.productName ?? 'Cart item'}
                        fill
                        sizes="140px"
                        style={{ objectFit: 'contain' }}
                      />
                    ) : (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          color: '#6b7280',
                        }}
                      >
                        No preview
                      </div>
                    )}
                  </div>

                  <div>
                    <h2 style={{ margin: 0, marginBottom: 4, fontSize: '1rem' }}>
                      {item.productName ?? 'Product'}
                    </h2>

                    {item.size && (
                      <p style={{ margin: 0, marginBottom: 4, fontSize: '0.85rem', color: '#9ca3af' }}>
                        Size: <strong>{item.size}</strong>
                      </p>
                    )}

                    <p style={{ margin: 0, marginBottom: 4, fontSize: '0.9rem', color: '#9ca3af' }}>
                      Design: <strong>{item.assetTitle ?? '(no design title)'}</strong>
                    </p>

                    <p style={{ margin: 0, marginBottom: 8, fontSize: '0.9rem', color: '#9ca3af' }}>
                      Price:{' '}
                      {lineTotal !== null
                        ? `$${lineTotal.toFixed(2)}${item.quantity > 1 ? ` ($${priceNumber!.toFixed(2)} x ${item.quantity})` : ''}`
                        : 'Not set'}
                    </p>

                    {/* Quantity stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <button
                        onClick={() => handleQuantityChange(index, -1)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: '1px solid #374151',
                          background: '#111827',
                          color: '#e5e7eb',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          lineHeight: 1,
                        }}
                      >
                        −
                      </button>
                      <span style={{ fontSize: '0.95rem', minWidth: 20, textAlign: 'center' }}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleQuantityChange(index, 1)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: '1px solid #374151',
                          background: '#111827',
                          color: '#e5e7eb',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          lineHeight: 1,
                        }}
                      >
                        +
                      </button>
                    </div>

                    <button
                      onClick={() => handleRemoveItem(index)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid #4b5563',
                        background: '#111827',
                        color: '#e5e7eb',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Summary */}
          <aside
            style={{
              padding: 16,
              borderRadius: 12,
              border: '1px solid #1f2937',
              background: '#020617',
              alignSelf: 'flex-start',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Summary</h2>
            <p style={{ margin: 0, marginBottom: 4, fontSize: '0.9rem', color: '#9ca3af' }}>
              Items: <strong>{items.reduce((s, i) => s + i.quantity, 0)}</strong>
            </p>
            <p style={{ margin: 0, marginBottom: 16, fontSize: '0.9rem', color: '#9ca3af' }}>
              Total: <strong>${total.toFixed(2)}</strong>
            </p>

            {checkoutError && (
              <p style={{ color: '#fca5a5', fontSize: '0.85rem', marginBottom: 12 }}>
                {checkoutError}
              </p>
            )}

            <button
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #10b981',
                background: '#022c22',
                color: '#a7f3d0',
                cursor: checkingOut ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
              }}
              onClick={handleCheckout}
              disabled={checkingOut}
            >
              {checkingOut ? 'Redirecting…' : 'Proceed to checkout'}
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}
