/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import FilterBar from '@/components/FilterBar';

type ProductDoc = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  mockupImageUrl?: string | null;
  niche?: string;
  style?: string;
  product_category?: string;
  printifyProductId?: string;
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

export default function ShopPage() {
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNiche, setActiveNiche] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setLoading(true);

        const q = query(
          collection(db, 'assets'),
          where('printifyStatus', 'in', ['published', 'created']),
        );
        const snap = await getDocs(q);

        const items: ProductDoc[] = snap.docs.map((doc) => {
          const data = doc.data() as any;
          const mockupImageUrl: string | null =
            data.mockupUrl ?? data.imageUrl ?? null;

          return {
            id: doc.id,
            name: resolveTitle(data.title, data.niche, data.productCategory ?? data.product_category),
            description: data.description ?? '',
            price: typeof data.price === 'number' ? data.price : 25,
            mockupImageUrl,
            niche: data.niche ?? '',
            style: data.style ?? '',
            product_category: data.productCategory ?? data.product_category ?? '',
            printifyProductId: data.printifyProductId ?? '',
          };
        });

        setProducts(items);
      } catch (err: any) {
        setError(err?.message || 'Failed to load products.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const niches = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.niche) set.add(p.niche);
    return Array.from(set).sort();
  }, [products]);

  const styles = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.style) set.add(p.style);
    return Array.from(set).sort();
  }, [products]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.product_category) set.add(p.product_category);
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    let result = products;
    if (activeNiche) result = result.filter((p) => p.niche === activeNiche);
    if (activeStyle) result = result.filter((p) => p.style === activeStyle);
    if (activeCategory) result = result.filter((p) => p.product_category === activeCategory);
    return result;
  }, [products, activeNiche, activeStyle, activeCategory]);

  function handleFilterChange(key: string, value: string | null) {
    if (key === 'niche') setActiveNiche(value);
    else if (key === 'style') setActiveStyle(value);
    else if (key === 'product_category') setActiveCategory(value);
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
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
          <p style={{ fontSize: '0.9rem', color: '#9ca3af' }}>Loading products…</p>
        )}

        {error && (
          <p style={{ fontSize: '0.9rem', color: '#fca5a5', marginBottom: 12 }}>{error}</p>
        )}

        {!loading && !error && products.length === 0 && (
          <p style={{ fontSize: '0.9rem', color: '#9ca3af' }}>
            No products are available yet. Check back soon!
          </p>
        )}

        {!loading && !error && products.length > 0 && (
          <>
            <FilterBar
              filters={[
                { key: 'product_category', label: 'Type', values: categories },
                { key: 'niche', label: 'Niche', values: niches },
                { key: 'style', label: 'Style', values: styles },
              ]}
              active={{ product_category: activeCategory, niche: activeNiche, style: activeStyle }}
              onChange={handleFilterChange}
            />

            {filtered.length === 0 && (
              <p style={{ fontSize: '0.9rem', color: '#9ca3af' }}>
                No products match the selected filters.
              </p>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              {filtered.map((p) => {
                const priceDisplay =
                  typeof p.price === 'number' ? `$${p.price.toFixed(2)}` : 'Price TBA';

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
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.mockupImageUrl}
                          alt={p.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
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

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        flexGrow: 1,
                      }}
                    >
                      {p.product_category && (
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            borderRadius: 999,
                            border: '1px solid #374151',
                            background: '#111827',
                            color: '#9ca3af',
                            alignSelf: 'flex-start',
                          }}
                        >
                          {categoryLabel(p.product_category)}
                        </span>
                      )}
                      <h2 style={{ margin: 0, fontSize: '1rem' }}>{p.name}</h2>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#9ca3af' }}>
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

                    <div style={{ marginTop: 8 }}>
                      <Link
                        href={`/shop/${p.id}`}
                        style={{
                          display: 'block',
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
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
