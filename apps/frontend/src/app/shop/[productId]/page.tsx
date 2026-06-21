/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';

const APPAREL = new Set(['shirt', 'hoodie', 'tote']);
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

type ProductDoc = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  active?: boolean;
  mockupImageUrl?: string | null;
  defaultAssetId?: string | null;
  product_category?: string;
};

function resolveTitle(title: string | undefined, niche: string | undefined, category: string | undefined): string {
  if (title && title !== 'AI generated design') return title;
  const parts = [niche, category].filter(Boolean).map((s) => s!.charAt(0).toUpperCase() + s!.slice(1));
  return parts.length > 0 ? parts.join(' ') + ' Design' : 'Untitled';
}

function categoryLabel(raw: string): string {
  const map: Record<string, string> = {
    shirt: 'Shirt',
    hoodie: 'Hoodie',
    tote: 'Tote Bag',
    mug: 'Mug',
    cup: 'Cup',
  };
  return map[raw.toLowerCase()] ?? raw;
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addItem } = useCart();
  const productId = params?.productId as string;

  const [product, setProduct] = useState<ProductDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [addedToCart, setAddedToCart] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!productId) return;
      try {
        setError(null);
        setLoading(true);

        const ref = doc(db, 'assets', productId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError('Product not found.');
          setProduct(null);
          return;
        }

        const data = snap.data() as any;
        const resolvedMockupUrl: string | null =
          data.mockupUrl ?? data.imageUrl ?? null;

        setProduct({
          id: snap.id,
          name: resolveTitle(data.title, data.niche, data.productCategory ?? data.product_category),
          description: data.description ?? '',
          price: typeof data.price === 'number' ? data.price : 25,
          active: true,
          mockupImageUrl: resolvedMockupUrl,
          defaultAssetId: null,
          product_category: data.productCategory ?? data.product_category ?? '',
        });
      } catch (err: any) {
        setError(err?.message || 'Failed to load product.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [productId]);

  function handleAddToCart() {
    if (!product) return;
    addItem({
      id: product.id,
      name: product.name,
      price: product.price ?? 25,
      mockupImageUrl: product.mockupImageUrl,
      product_category: product.product_category,
    } as any);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  }

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: '#020617', color: '#e5e7eb', padding: 24 }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <p style={{ fontSize: '0.95rem', color: '#9ca3af' }}>Loading product…</p>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main style={{ minHeight: '100vh', background: '#020617', color: '#e5e7eb', padding: 24 }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <h1 style={{ marginTop: 0 }}>Product not found</h1>
          {error && <p style={{ fontSize: '0.9rem', color: '#fca5a5' }}>{error}</p>}
          <button
            type="button"
            onClick={() => router.push('/shop')}
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #4b5563',
              background: '#111827',
              color: '#e5e7eb',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Back to shop
          </button>
        </div>
      </main>
    );
  }

  const priceDisplay =
    typeof product.price === 'number' ? `$${product.price.toFixed(2)}` : 'Price TBA';

  const canCustomize = !!product.defaultAssetId;
  const isApparel = product.product_category
    ? APPAREL.has(product.product_category.toLowerCase())
    : false;
  const needsSize = isApparel && !selectedSize;
  const canAddToCart = !!product.active && !needsSize;

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#e5e7eb', padding: 24 }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => router.push('/shop')}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid #4b5563',
              background: '#111827',
              color: '#e5e7eb',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            ← Back to shop
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: 24,
            alignItems: 'flex-start',
          }}
        >
          {/* Image */}
          <div>
            <div
              style={{
                borderRadius: 16,
                border: '1px solid #1f2937',
                background: '#020617',
                padding: 12,
              }}
            >
              <div
                style={{
                  borderRadius: 12,
                  border: '1px solid #111827',
                  overflow: 'hidden',
                  background: '#020617',
                  aspectRatio: '1 / 1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div className="relative aspect-square w-full max-w-100 mx-auto overflow-hidden rounded-2xl bg-white/5 border border-white/10">
                  {product.mockupImageUrl ? (
                    <Image
                      src={product.mockupImageUrl}
                      alt={product.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 hover:scale-105"
                      priority
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-xs font-mono uppercase tracking-widest text-white/20">
                        No Mockup Available
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              {product.product_category && (
                <span
                  style={{
                    display: 'inline-block',
                    marginBottom: 6,
                    fontSize: '0.75rem',
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: '1px solid #374151',
                    background: '#111827',
                    color: '#9ca3af',
                  }}
                >
                  {categoryLabel(product.product_category)}
                </span>
              )}
              <h1 style={{ margin: 0, fontSize: '1.6rem' }}>{product.name}</h1>
              <p style={{ margin: 0, marginTop: 4, fontSize: '1.1rem', color: '#e5e7eb' }}>
                {priceDisplay}
              </p>
              {!product.active && (
                <p style={{ margin: 0, marginTop: 4, fontSize: '0.85rem', color: '#f97316' }}>
                  This product is currently inactive.
                </p>
              )}
            </div>

            {product.description && (
              <p
                style={{
                  margin: 0,
                  fontSize: '0.95rem',
                  color: '#d1d5db',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {product.description}
              </p>
            )}

            {/* Size selector — apparel only */}
            {isApparel && (
              <div>
                <p style={{ margin: 0, marginBottom: 8, fontSize: '0.8rem', color: '#9ca3af' }}>
                  Size
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {SIZES.map((s) => {
                    const active = selectedSize === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSelectedSize(active ? null : s)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 6,
                          border: `1px solid ${active ? '#10b981' : '#374151'}`,
                          background: active ? '#022c22' : '#111827',
                          color: active ? '#a7f3d0' : '#9ca3af',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!canAddToCart}
                style={{
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: `1px solid ${canAddToCart ? '#10b981' : '#374151'}`,
                  background: canAddToCart ? '#022c22' : '#020617',
                  color: canAddToCart ? '#a7f3d0' : '#4b5563',
                  fontSize: '0.95rem',
                  cursor: canAddToCart ? 'pointer' : 'not-allowed',
                }}
              >
                {addedToCart ? '✓ Added to cart' : needsSize ? 'Select a size' : 'Add to Cart'}
              </button>

              {canCustomize && (
                <Link
                  href={`/studio?productId=${product.id}&assetId=${product.defaultAssetId}`}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 999,
                    border: '1px solid #4b5563',
                    background: '#111827',
                    color: '#9ca3af',
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  Customize this design
                </Link>
              )}
            </div>

            <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>
              {canCustomize
                ? 'Add to cart with the original design, or use Customize to adjust placement.'
                : 'Add to cart to purchase with the original design.'}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
