# Niche & Style Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clickable single-select niche/style pill filters to `/gallery` and `/shop`, backed by new fields on product Firestore docs and admin forms.

**Architecture:** Client-side filtering only — data is loaded once into React state, then `useMemo` computes filtered subsets. A shared `FilterBar` component handles pill rendering and click logic. No Firestore query changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Firestore (client SDK), inline styles throughout.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/types.ts` | Add `style` to `Asset`; add `niche`, `style` to `Product` |
| Create | `src/components/FilterBar.tsx` | Shared pill-chip filter UI |
| Modify | `src/app/gallery/page.tsx` | Read `style`, add filter state + useMemo, use FilterBar |
| Modify | `src/app/shop/page.tsx` | Add `niche`/`style` to ProductDoc, filter state + useMemo, use FilterBar |
| Modify | `src/app/admin/products/new/page.tsx` | Add niche/style inputs + Firestore write |
| Modify | `src/app/admin/products/[productId]/page.tsx` | Add niche/style to ProductState, form, updateDoc |

---

## Task 1: Update shared types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update `types.ts`**

Replace the entire file content:

```ts
export interface Product {
  id: string;
  name: string;
  description?: string;
  price?: number;
  base_price?: number;
  active?: boolean;
  featured?: boolean;
  mockupImageUrl?: string | null;
  mockup_image_url?: string | null;
  imageUrl?: string | null;
  mockup_base_image?: string | null;
  defaultAssetId?: string | null;
  niche?: string;
  style?: string;
  createdAt?: number;
}

export interface Asset {
  id: string;
  title: string;
  niche?: string;
  style?: string;
  imageUrl: string;
  thumbUrl?: string;
  prompt?: string;
  source?: string;
  createdAt?: number;
  published?: boolean;
}
```

- [ ] **Step 2: Verify with lint**

Run from `apps/frontend/`:
```bash
npm run lint
```
Expected: no errors related to `types.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/types.ts
git commit -m "feat: add niche and style fields to Asset and Product types"
```

---

## Task 2: Create FilterBar component

**Files:**
- Create: `src/components/FilterBar.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

type FilterDimension = {
  key: 'niche' | 'style';
  label: string;
  values: string[];
};

type FilterBarProps = {
  filters: FilterDimension[];
  active: Record<'niche' | 'style', string | null>;
  onChange: (key: 'niche' | 'style', value: string | null) => void;
};

export default function FilterBar({ filters, active, onChange }: FilterBarProps) {
  const dimensions = filters.filter((f) => f.values.length > 0);
  if (dimensions.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {dimensions.map((dim) => (
        <div
          key={dim.key}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: '0.75rem', color: '#6b7280', minWidth: 36 }}>
            {dim.label}
          </span>
          {dim.values.map((val) => {
            const isActive = active[dim.key] === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => onChange(dim.key, isActive ? null : val)}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: `1px solid ${isActive ? '#06b6d4' : '#4b5563'}`,
                  background: isActive ? '#0c2a31' : '#1f2937',
                  color: isActive ? '#a5f3fc' : '#9ca3af',
                  cursor: 'pointer',
                }}
              >
                {val}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify with lint**

```bash
npm run lint
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/FilterBar.tsx
git commit -m "feat: add FilterBar shared pill-chip filter component"
```

---

## Task 3: Update gallery page

**Files:**
- Modify: `src/app/gallery/page.tsx`

The gallery page already loads `niche` from Firestore and has a non-interactive niche pill row. This task wires `style`, adds filter state, and replaces the pill display with `<FilterBar>`.

- [ ] **Step 1: Replace the file**

```tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import FilterBar from '@/components/FilterBar';

type Asset = {
  id: string;
  title?: string;
  imageUrl?: string;
  thumbUrl?: string;
  niche?: string;
  style?: string;
  source?: string;
  createdAt?: Date;
  published?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coerceDate(v: any): Date | undefined {
  if (!v) return undefined;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

export default function GalleryPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNiche, setActiveNiche] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const q = query(
          collection(db, 'assets'),
          orderBy('createdAt', 'desc'),
          limit(60)
        );

        const snap = await getDocs(q);
        if (cancelled) return;

        const items = snap.docs.map((d) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = d.data() || {};
          const createdAt = coerceDate(data.createdAt ?? data.created_at);

          return {
            id: d.id,
            title: data.title ?? '',
            niche: data.niche ?? '',
            style: data.style ?? '',
            imageUrl: data.imageUrl ?? '',
            thumbUrl: data.thumbUrl ?? data.imageUrl ?? '',
            source: data.source ?? '',
            published: data.published,
            createdAt,
          } satisfies Asset;
        });

        setAssets(items);
      } catch (e) {
        console.error('Failed to load gallery assets:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const niches = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.niche) set.add(a.niche);
    return Array.from(set).sort();
  }, [assets]);

  const styles = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.style) set.add(a.style);
    return Array.from(set).sort();
  }, [assets]);

  const filtered = useMemo(() => {
    let result = assets;
    if (activeNiche) result = result.filter((a) => a.niche === activeNiche);
    if (activeStyle) result = result.filter((a) => a.style === activeStyle);
    return result;
  }, [assets, activeNiche, activeStyle]);

  function handleFilterChange(key: 'niche' | 'style', value: string | null) {
    if (key === 'niche') setActiveNiche(value);
    else setActiveStyle(value);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Gallery
      </h1>

      {loading && <p style={{ color: '#6b7280' }}>Loading…</p>}

      {!loading && assets.length === 0 && (
        <p style={{ color: '#6b7280' }}>
          No assets yet. (If you later add a <code>published</code> filter, make
          sure at least one asset has <code>published: true</code>.)
        </p>
      )}

      {!loading && assets.length > 0 && (
        <>
          <FilterBar
            filters={[
              { key: 'niche', label: 'Niche', values: niches },
              { key: 'style', label: 'Style', values: styles },
            ]}
            active={{ niche: activeNiche, style: activeStyle }}
            onChange={handleFilterChange}
          />

          {filtered.length === 0 && (
            <p style={{ color: '#6b7280' }}>No assets match the selected filters.</p>
          )}

          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            }}
          >
            {filtered.map((asset) => {
              const src = asset.thumbUrl || asset.imageUrl || '/mock.png';
              return (
                <Link
                  key={asset.id}
                  href={`/asset/${asset.id}`}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    overflow: 'hidden',
                    textDecoration: 'none',
                    color: 'inherit',
                    background: '#fff',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1 / 1',
                      background: '#f3f4f6',
                    }}
                  >
                    <Image
                      src={src}
                      alt={asset.title || 'Generated design'}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      style={{ objectFit: 'cover' }}
                    />
                  </div>

                  <div style={{ padding: 12 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {asset.title || 'Untitled'}
                    </p>

                    {asset.niche && (
                      <p
                        style={{
                          margin: '4px 0 0 0',
                          fontSize: '0.85rem',
                          color: '#6b7280',
                        }}
                      >
                        {asset.niche}
                      </p>
                    )}

                    {asset.createdAt && (
                      <p
                        style={{
                          margin: '6px 0 0 0',
                          fontSize: '0.75rem',
                          color: '#9ca3af',
                        }}
                      >
                        {asset.createdAt.toLocaleString()}
                      </p>
                    )}

                    {asset.source && (
                      <p
                        style={{
                          margin: '4px 0 0 0',
                          fontSize: '0.75rem',
                          color: '#6b7280',
                        }}
                      >
                        Source: {asset.source}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify with lint**

```bash
npm run lint
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/gallery/page.tsx
git commit -m "feat: add niche/style filter pills to gallery page"
```

---

## Task 4: Update shop page

**Files:**
- Modify: `src/app/shop/page.tsx`

The shop page currently has no filtering. This task adds `niche`/`style` to the local type, maps them from Firestore, builds filter state, and renders `<FilterBar>`.

- [ ] **Step 1: Replace the file**

```tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import FilterBar from '@/components/FilterBar';

type ProductDoc = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  active?: boolean;
  mockupImageUrl?: string | null;
  defaultAssetId?: string | null;
  niche?: string;
  style?: string;
};

export default function ShopPage() {
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNiche, setActiveNiche] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setLoading(true);

        const productsCol = collection(db, 'products');
        const q = query(
          productsCol,
          where('active', '==', true),
          orderBy('name', 'asc'),
        );
        const snap = await getDocs(q);

        const items: ProductDoc[] = snap.docs.map((doc) => {
          const data = doc.data() as any;

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
            niche: data.niche ?? '',
            style: data.style ?? '',
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

  const filtered = useMemo(() => {
    let result = products;
    if (activeNiche) result = result.filter((p) => p.niche === activeNiche);
    if (activeStyle) result = result.filter((p) => p.style === activeStyle);
    return result;
  }, [products, activeNiche, activeStyle]);

  function handleFilterChange(key: 'niche' | 'style', value: string | null) {
    if (key === 'niche') setActiveNiche(value);
    else setActiveStyle(value);
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
          <p style={{ fontSize: '0.9rem', color: '#9ca3af' }}>
            Loading products…
          </p>
        )}

        {error && (
          <p style={{ fontSize: '0.9rem', color: '#fca5a5', marginBottom: 12 }}>
            {error}
          </p>
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
                { key: 'niche', label: 'Niche', values: niches },
                { key: 'style', label: 'Style', values: styles },
              ]}
              active={{ niche: activeNiche, style: activeStyle }}
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
                          onError={(e) =>
                            console.error(
                              '[SHOP] Failed to load product image:',
                              e.currentTarget.src,
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

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        flexGrow: 1,
                      }}
                    >
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

                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
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
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify with lint**

```bash
npm run lint
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/shop/page.tsx
git commit -m "feat: add niche/style filter pills to shop page"
```

---

## Task 5: Update admin new product form

**Files:**
- Modify: `src/app/admin/products/new/page.tsx`

Add `niche` and `style` state, inputs, and include them in the Firestore `addDoc` payload.

- [ ] **Step 1: Add state declarations**

In `src/app/admin/products/new/page.tsx`, after the existing `const [featured, setFeatured] = useState(false);` line (line 22), add:

```tsx
  const [niche, setNiche] = useState('');
  const [style, setStyle] = useState('');
```

- [ ] **Step 2: Add fields to the Firestore write**

Inside the `addDoc` call's payload object (around line 48), add the two new fields alongside the existing ones:

```tsx
        niche: niche.trim() || null,
        style: style.trim() || null,
```

The full `addDoc` call should become:

```tsx
      const docRef = await addDoc(collection(db, 'products'), {
        name: name.trim(),
        description: description.trim(),
        price: priceNumber,
        mockupImageUrl: mockupImageUrl.trim() || null,
        defaultAssetId: defaultAssetId.trim() || null,
        niche: niche.trim() || null,
        style: style.trim() || null,
        active,
        featured,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
```

- [ ] **Step 3: Add form inputs**

After the `{/* Description */}` block and before the `{/* Price */}` block, add:

```tsx
          {/* Niche */}
          <div>
            <label
              style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}
            >
              Niche (optional)
            </label>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. gaming, fitness, pets"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
              }}
            />
            <p style={{ margin: 0, marginTop: 4, fontSize: '0.8rem', color: '#9ca3af' }}>
              Used for gallery and shop filtering.
            </p>
          </div>

          {/* Style tag */}
          <div>
            <label
              style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}
            >
              Style tag (optional)
            </label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. Retro Synthwave, Minimalist Line Art"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
              }}
            />
            <p style={{ margin: 0, marginTop: 4, fontSize: '0.8rem', color: '#9ca3af' }}>
              Used for gallery and shop filtering.
            </p>
          </div>
```

- [ ] **Step 4: Verify with lint**

```bash
npm run lint
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/admin/products/new/page.tsx
git commit -m "feat: add niche and style tag fields to new product admin form"
```

---

## Task 6: Update admin edit product form

**Files:**
- Modify: `src/app/admin/products/[productId]/page.tsx`

The edit page uses a `ProductState` object and a generic `handleFieldChange` helper, so adding the fields only requires three changes: extend the type, populate from Firestore, update the form JSX, and include in `updateDoc`.

- [ ] **Step 1: Add fields to `ProductState` type**

Replace the existing `ProductState` type (lines 10–18):

```tsx
type ProductState = {
  name: string;
  description: string;
  priceInput: string;
  mockupImageUrl: string;
  defaultAssetId: string;
  niche: string;
  style: string;
  active: boolean;
  featured: boolean;
};
```

- [ ] **Step 2: Populate from Firestore**

Inside the `load` function, add `niche` and `style` to the `state` object (around line 55–63):

```tsx
        const state: ProductState = {
          name: data.name ?? '',
          description: data.description ?? '',
          priceInput: typeof data.price === 'number' ? String(data.price) : '',
          mockupImageUrl: data.mockupImageUrl ?? '',
          defaultAssetId: data.defaultAssetId ?? '',
          niche: data.niche ?? '',
          style: data.style ?? '',
          active: typeof data.active === 'boolean' ? data.active : true,
          featured: typeof data.featured === 'boolean' ? data.featured : false,
        };
```

- [ ] **Step 3: Add fields to `updateDoc` payload**

Inside `handleSubmit`, add to the `updateDoc` call (around line 103–112):

```tsx
      await updateDoc(ref, {
        name: product.name.trim(),
        description: product.description.trim(),
        price: priceNumber,
        mockupImageUrl: product.mockupImageUrl.trim() || null,
        defaultAssetId: product.defaultAssetId.trim() || null,
        niche: product.niche.trim() || null,
        style: product.style.trim() || null,
        active: product.active,
        featured: product.featured,
        updatedAt: serverTimestamp(),
      });
```

- [ ] **Step 4: Add form inputs**

After the `{/* Description */}` block and before the `{/* Price */}` block, add:

```tsx
          {/* Niche */}
          <div>
            <label
              style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}
            >
              Niche (optional)
            </label>
            <input
              type="text"
              value={product.niche}
              onChange={(e) => handleFieldChange('niche', e.target.value)}
              placeholder="e.g. gaming, fitness, pets"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
              }}
            />
            <p style={{ margin: 0, marginTop: 4, fontSize: '0.8rem', color: '#9ca3af' }}>
              Used for gallery and shop filtering.
            </p>
          </div>

          {/* Style tag */}
          <div>
            <label
              style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}
            >
              Style tag (optional)
            </label>
            <input
              type="text"
              value={product.style}
              onChange={(e) => handleFieldChange('style', e.target.value)}
              placeholder="e.g. Retro Synthwave, Minimalist Line Art"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #4b5563',
                background: '#020617',
                color: '#e5e7eb',
              }}
            />
            <p style={{ margin: 0, marginTop: 4, fontSize: '0.8rem', color: '#9ca3af' }}>
              Used for gallery and shop filtering.
            </p>
          </div>
```

- [ ] **Step 5: Verify with lint**

```bash
npm run lint
```
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/admin/products/[productId]/page.tsx
git commit -m "feat: add niche and style tag fields to edit product admin form"
```

---

## Task 7: Production build verification

**Files:** none changed

- [ ] **Step 1: Run production build**

From `apps/frontend/`:
```bash
npm run build
```
Expected: build completes with no TypeScript errors. Output ends with:
```
Route (app)                              Size     First Load JS
...
✓ Compiled successfully
```

- [ ] **Step 2: Manual smoke test**

Start the dev server and verify manually:
```bash
npm run dev
```

Checklist:
- `/gallery` — filter bar appears with niche/style rows (if assets have those fields); clicking a pill highlights it and narrows the grid; clicking the same pill again clears it.
- `/shop` — filter bar appears above products (if products have niche/style set); same toggle behavior.
- `/admin/products/new` — "Niche" and "Style tag" inputs appear in the form.
- `/admin/products/[id]` — same inputs appear pre-populated with saved values.

- [ ] **Step 3: Commit build-clean confirmation (if any lint fixes were made)**

If no files changed, skip. Otherwise:
```bash
git add -p
git commit -m "fix: lint cleanup after Sprint 7 filter implementation"
```
