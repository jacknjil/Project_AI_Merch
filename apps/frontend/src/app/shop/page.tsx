/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
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
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc'>('newest');

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setLoading(true);

        const q = query(
          collection(db, 'assets'),
          where('printifyStatus', 'in', ['published', 'created']),
          orderBy('createdAt', 'desc'),
          // Composite index required: printifyStatus + createdAt desc
          // Firestore console provides creation link on first runtime error
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

  const sorted = useMemo(() => {
    const base = [...filtered];
    if (sortBy === 'price-asc') return base.sort((a, b) => (a.price ?? 25) - (b.price ?? 25));
    if (sortBy === 'price-desc') return base.sort((a, b) => (b.price ?? 25) - (a.price ?? 25));
    return base;
  }, [filtered, sortBy]);

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
          <>
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ borderRadius: 12, border: '1px solid #1f2937', background: '#020617', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ aspectRatio: '1/1', borderRadius: 10, background: '#111827', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 14, borderRadius: 4, background: '#1f2937', width: '60%' }} />
                  <div style={{ height: 12, borderRadius: 4, background: '#1f2937', width: '40%' }} />
                </div>
              ))}
            </div>
          </>
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Sort</span>
              {(['newest', 'price-asc', 'price-desc'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setSortBy(s)}
                  style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${sortBy === s ? '#06b6d4' : '#4b5563'}`,
                    background: sortBy === s ? '#0c2a31' : '#1f2937',
                    color: sortBy === s ? '#a5f3fc' : '#9ca3af' }}>
                  {s === 'newest' ? 'Newest' : s === 'price-asc' ? 'Price ↑' : 'Price ↓'}
                </button>
              ))}
            </div>

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
              {sorted.map((p) => {
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
                        position: 'relative',
                      }}
                    >
                      {p.mockupImageUrl ? (
                        <Image
                          src={p.mockupImageUrl}
                          alt={p.name}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', padding: 8 }}>
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
