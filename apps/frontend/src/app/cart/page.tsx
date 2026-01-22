'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';

const CART_KEY = 'aiMerchCart';

type CartItem = {
  productId: string;
  productName: string;
  price?: number;
  assetId?: string;
  assetTitle?: string;
  scale?: number;
  position?: { x: number; y: number };
  mockupImageUrl?: string | null;
};

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Load cart from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(CART_KEY);
      if (!raw) {
        setItems([]);
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setItems(parsed);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error('[CART] Error reading cart:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveCart = (next: CartItem[]) => {
    setItems(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CART_KEY, JSON.stringify(next));
    }
  };

  const handleClearCart = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CART_KEY);
    }
    setItems([]);
  };

  const handleRemoveItem = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    saveCart(next);
  };

  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setCheckoutError(null);
    setCheckingOut(true);

    try {
      const payload = {
        // anonymous for now
        userId: 'anon',
        items: items.map((item, index) => ({
          // your API expects an item.id — cart currently doesn’t have one
          id: `${Date.now()}-${index}`,

          assetId: item.assetId ?? '',
          productId: item.productId,
          assetTitle: item.assetTitle ?? 'Untitled design',
          productName: item.productName ?? 'Product',

          // your cart has no quantity yet, so default 1
          quantity: 1,
        })),
      };

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Checkout failed (${res.status})`);
      }

      if (!data?.url) {
        throw new Error('Stripe session URL missing from response');
      }

      window.location.href = data.url;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error('[CART] Checkout error:', e);
      setCheckoutError(e?.message ?? 'Checkout failed');
      setCheckingOut(false);
    }
  };

  const total = items.reduce((sum, item) => {
    const p =
      typeof item.price === 'number' && !Number.isNaN(item.price)
        ? item.price
        : 0;
    return sum + p;
  }, 0);

  // ---------- Render states ----------

  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: '#020617',
          color: '#e5e7eb',
          padding: 24,
        }}
      >
        <h1>Cart</h1>
        <p>Loading cart…</p>
      </main>
    );
  }

  if (!items.length) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: '#020617',
          color: '#e5e7eb',
          padding: 24,
        }}
      >
        <h1>Cart</h1>
        <p>Your cart is empty.</p>
      </main>
    );
  }

  // ---------- Main UI ----------

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
        padding: 24,
      }}
    >
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

      <section
        style={{
          maxWidth: 960,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
            gap: 24,
          }}
        >
          {/* Items list */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 16,
            }}
          >
            {items.map((item, index) => {
              const priceNumber =
                typeof item.price === 'number' && !Number.isNaN(item.price)
                  ? item.price
                  : null;

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
                  <div>
                    {item.mockupImageUrl ? (
                      <Image
                        src={item.mockupImageUrl}
                        alt={item.assetTitle ?? item.productName ?? 'Cart item'}
                        onError={(e) =>
                          console.error(
                            '[CART] Image failed to load:',
                            e.currentTarget.src
                          )
                        }
                        style={{
                          display: 'block',
                          width: '100%',
                          maxHeight: 200,
                          objectFit: 'contain',
                          borderRadius: 8,
                          border: '1px solid #374151',
                          background: '#020617',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '1 / 1',
                          borderRadius: 8,
                          border: '1px dashed #374151',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          color: '#6b7280',
                        }}
                      >
                        No preview image
                      </div>
                    )}
                  </div>

                  <div>
                    <h2 style={{ margin: 0, marginBottom: 4 }}>
                      {item.productName ?? 'Product'}
                    </h2>

                    <p
                      style={{
                        margin: 0,
                        marginBottom: 4,
                        fontSize: '0.9rem',
                        color: '#9ca3af',
                      }}
                    >
                      Design:{' '}
                      <strong>{item.assetTitle ?? '(no design title)'}</strong>
                    </p>

                    <p
                      style={{
                        margin: 0,
                        marginBottom: 4,
                        fontSize: '0.9rem',
                        color: '#9ca3af',
                      }}
                    >
                      Price:{' '}
                      {priceNumber !== null
                        ? `$${priceNumber.toFixed(2)}`
                        : 'Not set'}
                    </p>

                    <p
                      style={{
                        margin: 0,
                        marginTop: 8,
                        fontSize: '0.8rem',
                        color: '#6b7280',
                      }}
                    >
                      productId: <code>{item.productId}</code>
                      <br />
                      assetId: <code>{item.assetId ?? '(none)'}</code>
                    </p>

                    <button
                      onClick={() => handleRemoveItem(index)}
                      style={{
                        marginTop: 8,
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

          {/* Summary column */}
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
            <p
              style={{
                margin: 0,
                marginBottom: 4,
                fontSize: '0.9rem',
                color: '#9ca3af',
              }}
            >
              Items: <strong>{items.length}</strong>
            </p>
            <p
              style={{
                margin: 0,
                marginBottom: 16,
                fontSize: '0.9rem',
                color: '#9ca3af',
              }}
            >
              Total: <strong>${total.toFixed(2)}</strong>
            </p>

            {checkoutError && (
              <p
                style={{
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  marginBottom: 12,
                }}
              >
                {checkoutError}
              </p>
            )}

            {/* Hook this up to your Stripe checkout when you're ready */}
            <button
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #10b981',
                background: '#022c22',
                color: '#a7f3d0',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
              onClick={handleCheckout}
              disabled={checkingOut}
            >
              Proceed to checkout
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}
