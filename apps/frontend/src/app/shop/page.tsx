'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
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

export default function ShopPage() {
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setLoading(true);

        const productsCol = collection(db, 'products');
        // Only active products; ordered by name
        const q = query(
          productsCol,
          where('active', '==', true),
          orderBy('name', 'asc')
        );
        const snap = await getDocs(q);

        const items: ProductDoc[] = snap.docs.map((doc) => {
          const data = doc.data() as any;

          // Use the same robust resolution of mockup URL as admin
          const resolvedMockupUrl: string | null =
            data.mockupImageUrl ??
            data.mockup_image_url ??
            data.imageUrl ??
            null;

          return {
            id: doc.id,
            name: data.name ?? 'Unnamed product',
            description: data.description ?? '',
            price: typeof data.price === 'number' ? data.price : undefined,
            active: typeof data.active === 'boolean' ? data.active : true,
            mockupImageUrl: resolvedMockupUrl,
            defaultAssetId: data.defaultAssetId ?? null,
          };
        });

        setProducts(items);
      } catch (err: any) {
        console.error('[SHOP] Error loading products:', err);
        setError(err?.message || 'Failed to load products.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

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
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        <header
          style={{
            marginBottom: 24,
          }}
        >
          <h1 style={{ margin: 0 }}>Shop</h1>
          <p
            style={{
              margin: 0,
              marginTop: 4,
              fontSize: '0.9rem',
              color: '#9ca3af',
            }}
          >
            Browse AI-generated designs and customize them before checkout.
          </p>
        </header>

        {loading && (
          <p
            style={{
              fontSize: '0.9rem',
              color: '#9ca3af',
            }}
          >
            Loading products…
          </p>
        )}

        {error && (
          <p
            style={{
              fontSize: '0.9rem',
              color: '#fca5a5',
              marginBottom: 12,
            }}
          >
            {error}
          </p>
        )}

        {!loading && !error && products.length === 0 && (
          <p
            style={{
              fontSize: '0.9rem',
              color: '#9ca3af',
            }}
          >
            No products are available yet. Check back soon!
          </p>
        )}

        {!loading && !error && products.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {products.map((p) => {
              const priceDisplay =
                typeof p.price === 'number'
                  ? `$${p.price.toFixed(2)}`
                  : 'Price TBA';

              const canCustomize = !!p.defaultAssetId;

              return (
                <article
                  key={p.id}
                  style={{
                    borderRadius: 12,
                    border: '1px solid #1f2937',
                    background: '#020617',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {/* Image */}
                  <div
                    style={{
                      borderRadius: 10,
                      border: '1px solid #111827',
                      overflow: 'hidden',
                      background: '#020617',
                      aspectRatio: '1 / 1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {p.mockupImageUrl ? (
                      <img
                        src={p.mockupImageUrl}
                        alt={p.name}
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
                          fontSize: '0.8rem',
                          color: '#6b7280',
                          textAlign: 'center',
                          padding: 8,
                        }}
                      >
                        No image yet
                      </span>
                    )}
                  </div>

                  {/* Text info */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      flexGrow: 1,
                    }}
                  >
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                      }}
                    >
                      {p.name}
                    </h2>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.9rem',
                        color: '#9ca3af',
                      }}
                    >
                      {priceDisplay}
                    </p>
                    {p.description && (
                      <p
                        style={{
                          margin: 0,
                          marginTop: 4,
                          fontSize: '0.8rem',
                          color: '#6b7280',
                        }}
                      >
                        {p.description.length > 120
                          ? p.description.slice(0, 117) + '...'
                          : p.description}
                      </p>
                    )}
                  </div>

                  {/* Buttons */}
                  <div
                    style={{
                      marginTop: 8,
                      display: 'flex',
                      gap: 8,
                    }}
                  >
                    <Link
                      href={`/shop/${p.id}`}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid #4b5563',
                        background: '#111827',
                        color: '#e5e7eb',
                        fontSize: '0.85rem',
                        textDecoration: 'none',
                        textAlign: 'center',
                      }}
                    >
                      View details
                    </Link>

                    {canCustomize ? (
                      <Link
                        href={`/studio?productId=${p.id}&assetId=${p.defaultAssetId}`}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px solid #10b981',
                          background: '#022c22',
                          color: '#a7f3d0',
                          fontSize: '0.85rem',
                          textDecoration: 'none',
                          textAlign: 'center',
                        }}
                      >
                        Customize
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px solid #374151',
                          background: '#020617',
                          color: '#4b5563',
                          fontSize: '0.8rem',
                          cursor: 'not-allowed',
                        }}
                        title="Set a default asset on this product to enable customization."
                      >
                        No default design
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
