'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type ProductDoc = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  active?: boolean;
  mockupImageUrl?: string | null;
  defaultAssetId?: string | null;
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.productId as string;

  const [product, setProduct] = useState<ProductDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!productId) return;
      try {
        setError(null);
        setLoading(true);

        const ref = doc(db, 'products', productId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError('Product not found.');
          setProduct(null);
          return;
        }

        const data = snap.data() as any;

        const resolvedMockupUrl: string | null =
          data.mockupImageUrl ?? data.mockup_image_url ?? data.imageUrl ?? null;

        const isActive = typeof data.active === 'boolean' ? data.active : true;

        const p: ProductDoc = {
          id: snap.id,
          name: data.name ?? 'Unnamed product',
          description: data.description ?? '',
          price: typeof data.price === 'number' ? data.price : undefined,
          active: isActive,
          mockupImageUrl: resolvedMockupUrl,
          defaultAssetId: data.defaultAssetId ?? null,
        };

        setProduct(p);
      } catch (err: any) {
        console.error('[SHOP] Error loading product detail:', err);
        setError(err?.message || 'Failed to load product.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [productId]);

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
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
          }}
        >
          <p
            style={{
              fontSize: '0.95rem',
              color: '#9ca3af',
            }}
          >
            Loading product…
          </p>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: '#020617',
          color: '#e5e7eb',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
          }}
        >
          <h1 style={{ marginTop: 0 }}>Product not found</h1>
          {error && (
            <p
              style={{
                fontSize: '0.9rem',
                color: '#fca5a5',
              }}
            >
              {error}
            </p>
          )}
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
    typeof product.price === 'number'
      ? `$${product.price.toFixed(2)}`
      : 'Price TBA';

  const canCustomize = !!product.defaultAssetId;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
        }}
      >
        {/* Breadcrumb / back link */}
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
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

        {/* Layout: image left, details right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: 24,
            alignItems: 'flex-start',
          }}
        >
          {/* Image side */}
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
                {product.mockupImageUrl ? (
                  <img
                    src={product.mockupImageUrl}
                    alt={product.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    onError={(e) =>
                      console.error(
                        '[SHOP] Failed to load product image:',
                        e.currentTarget.src
                      )
                    }
                  />
                ) : (
                  <span
                    style={{
                      fontSize: '0.9rem',
                      color: '#6b7280',
                      textAlign: 'center',
                      padding: 16,
                    }}
                  >
                    No preview image yet
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Detail side */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.6rem',
                }}
              >
                {product.name}
              </h1>
              <p
                style={{
                  margin: 0,
                  marginTop: 4,
                  fontSize: '1.1rem',
                  color: '#e5e7eb',
                }}
              >
                {priceDisplay}
              </p>
              {!product.active && (
                <p
                  style={{
                    margin: 0,
                    marginTop: 4,
                    fontSize: '0.85rem',
                    color: '#f97316',
                  }}
                >
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

            <div
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                border: '1px solid #1f2937',
                background: '#020617',
                fontSize: '0.85rem',
                color: '#9ca3af',
              }}
            >
              <p
                style={{
                  margin: 0,
                  marginBottom: 4,
                }}
              >
                This product supports on-the-fly customization. You can adjust
                the design placement and scale in our Studio before adding it to
                your cart.
              </p>
            </div>

            {/* Actions */}
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {canCustomize ? (
                <Link
                  href={`/studio?productId=${product.id}&assetId=${product.defaultAssetId}`}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 999,
                    border: '1px solid #10b981',
                    background: '#022c22',
                    color: '#a7f3d0',
                    fontSize: '0.95rem',
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  Customize this design
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  style={{
                    padding: '10px 14px',
                    borderRadius: 999,
                    border: '1px solid #374151',
                    background: '#020617',
                    color: '#4b5563',
                    fontSize: '0.9rem',
                    cursor: 'not-allowed',
                  }}
                  title="Set a default asset for this product in the admin panel to enable customization."
                >
                  No default design available
                </button>
              )}

              {/* Optional: direct add-to-cart later, once you have a non-Studio path */}
              <p
                style={{
                  margin: 0,
                  fontSize: '0.8rem',
                  color: '#6b7280',
                }}
              >
                To purchase this item, start by customizing it in Studio, then
                add it to your cart from there.
              </p>
            </div>

            {/* Debug info (optional, nice during development) */}
            <div
              style={{
                marginTop: 12,
                padding: 8,
                borderRadius: 8,
                border: '1px dashed #1f2937',
                background: '#020617',
                fontSize: '0.75rem',
                color: '#6b7280',
              }}
            >
              <div>
                Product ID: <code>{product.id}</code>
              </div>
              <div>
                defaultAssetId:{' '}
                <code>{product.defaultAssetId ?? '(none)'}</code>
              </div>
              <div
                style={{
                  marginTop: 4,
                  wordBreak: 'break-all',
                }}
              >
                mockupImageUrl:{' '}
                <code>{product.mockupImageUrl ?? '(none)'}</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
