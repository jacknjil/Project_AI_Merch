/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
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

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setLoading(true);

        const productsCol = collection(db, 'products');
        const q = query(productsCol, orderBy('name', 'asc'));

        const snap = await getDocs(q);
        const items: ProductDoc[] = snap.docs.map((doc) => {
          const data = doc.data() as any;

          // Try multiple possible field names, fall back in order
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
        console.error('[ADMIN] Error loading products:', err);
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
          maxWidth: 960,
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Products</h1>
            <p
              style={{
                margin: 0,
                marginTop: 4,
                fontSize: '0.9rem',
                color: '#9ca3af',
              }}
            >
              Manage products that appear in Shop and Studio.
            </p>
          </div>

          <Link
            href="/admin/products/new"
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #10b981',
              background: '#022c22',
              color: '#a7f3d0',
              fontSize: '0.85rem',
              textDecoration: 'none',
            }}
          >
            + New product
          </Link>
        </header>

        {/* Loading / error states */}
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

        {/* Product list */}
        {!loading && !error && products.length === 0 && (
          <p
            style={{
              fontSize: '0.9rem',
              color: '#9ca3af',
            }}
          >
            No products found. Click <strong>+ New product</strong> to create
            one.
          </p>
        )}

        {!loading && !error && products.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 12,
            }}
          >
            {products.map((p) => {
              const priceDisplay =
                typeof p.price === 'number'
                  ? `$${p.price.toFixed(2)}`
                  : 'Not set';

              return (
                <article
                  key={p.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid #1f2937',
                    background: '#020617',
                    display: 'grid',
                    gridTemplateColumns: '80px minmax(0, 1fr) auto auto',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  {/* Thumbnail */}
                  <div>
                    {p.mockupImageUrl ? (
                      <img
                        src={p.mockupImageUrl}
                        alt={p.name}
                        onError={(e) =>
                          console.error(
                            '[ADMIN] Product thumbnail failed:',
                            e.currentTarget.src,
                          )
                        }
                        style={{
                          width: 64,
                          height: 64,
                          objectFit: 'cover',
                          borderRadius: 8,
                          border: '1px solid #374151',
                          background: '#020617',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 8,
                          border: '1px dashed #374151',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.7rem',
                          color: '#6b7280',
                        }}
                      >
                        No image
                      </div>
                    )}
                  </div>

                  {/* Main info */}
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        marginBottom: 4,
                        fontSize: '1rem',
                      }}
                    >
                      {p.name}
                    </h2>
                    <p
                      style={{
                        margin: 0,
                        marginBottom: 4,
                        fontSize: '0.85rem',
                        color: '#9ca3af',
                      }}
                    >
                      Price: <strong>{priceDisplay}</strong>{' '}
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '2px 6px',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          border: '1px solid #374151',
                          background: p.active ? '#022c22' : '#111827',
                          color: p.active ? '#6ee7b7' : '#9ca3af',
                        }}
                      >
                        {p.active ? 'Active' : 'Inactive'}
                      </span>
                    </p>
                    <p
                      style={{
                        margin: 0,
                        marginTop: 4,
                        fontSize: '0.75rem',
                        color: '#6b7280',
                      }}
                    >
                      id: <code>{p.id}</code>
                    </p>

                    {/* Debug: show what URL we're using */}
                    <p
                      style={{
                        margin: 0,
                        marginTop: 4,
                        fontSize: '0.7rem',
                        color: '#6b7280',
                        wordBreak: 'break-all',
                      }}
                    >
                      mockupImageUrl:{' '}
                      <code>{p.mockupImageUrl ?? '(none)'}</code>
                    </p>
                  </div>

                  {/* View in shop */}
                  <Link
                    href={`/shop/${p.id}`}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #4b5563',
                      background: '#111827',
                      color: '#e5e7eb',
                      fontSize: '0.8rem',
                      textDecoration: 'none',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    View in shop
                  </Link>

                  {/* Edit */}
                  <Link
                    href={`/admin/products/${p.id}`}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #3b82f6',
                      background: '#0b1120',
                      color: '#bfdbfe',
                      fontSize: '0.8rem',
                      textDecoration: 'none',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Edit
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
