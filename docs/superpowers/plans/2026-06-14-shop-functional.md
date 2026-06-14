# Shop Page — Make It Functional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 2 bugs and add 4 features so /shop works end-to-end for a real customer — browse → view product → add to cart → checkout.

**Architecture:** All changes confined to 4 existing files plus FilterBar. No new files. Cart state stays in localStorage under `aiMerchCart` (existing convention). No test framework installed; each task ends with `npm run build` + `npm run lint` as the verification gate.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, React 19, Firebase Firestore, localStorage cart

**Spec:** `docs/superpowers/specs/2026-06-14-shop-page-functional.md`

---

## File Map

| File | Change |
|------|--------|
| `src/components/home/FeaturedProducts.tsx` | Fix broken link `/products/` → `/shop/` |
| `src/components/FilterBar.tsx` | Widen key types from `'niche' \| 'style'` to `string` |
| `src/app/shop/page.tsx` | Add `product_category` to type, badge, filter |
| `src/app/shop/[productId]/page.tsx` | Remove debug panel; add category badge, size selector, Add to Cart |
| `src/app/cart/page.tsx` | Remove debug info; add `quantity` + `size` to CartItem; add stepper UI |

---

## Task 1: Fix the broken homepage link

**Files:**
- Modify: `src/components/home/FeaturedProducts.tsx:53`

- [ ] **Step 1: Apply the fix**

In `src/components/home/FeaturedProducts.tsx`, find line 53 and change:
```tsx
href={`/products/${p.id}`}
```
to:
```tsx
href={`/shop/${p.id}`}
```

- [ ] **Step 2: Verify build passes**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```
Expected: build succeeds, no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/home/FeaturedProducts.tsx
git commit -m "fix: correct featured product link from /products to /shop"
```

---

## Task 2: Remove debug panels

**Files:**
- Modify: `src/app/shop/[productId]/page.tsx`
- Modify: `src/app/cart/page.tsx`

- [ ] **Step 1: Remove debug block from product detail page**

In `src/app/shop/[productId]/page.tsx`, delete the entire `<div>` block that starts with `{/* Debug info */}` (around lines 394–422). Delete this block completely:

```tsx
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
```

- [ ] **Step 2: Remove debug block from cart page**

In `src/app/cart/page.tsx`, delete the `<p>` block inside the cart item loop that shows `productId` and `assetId`. Delete this block completely:

```tsx
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
```

- [ ] **Step 3: Verify build passes**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/shop/[productId]/page.tsx apps/frontend/src/app/cart/page.tsx
git commit -m "fix: remove debug panels visible to end users"
```

---

## Task 3: Generalize FilterBar to support any filter key

**Files:**
- Modify: `src/components/FilterBar.tsx`

FilterBar currently has `'niche' | 'style'` hardcoded. Widening to `string` makes it accept any key with zero runtime change.

- [ ] **Step 1: Replace the full content of FilterBar.tsx**

```tsx
'use client';

type FilterDimension = {
  key: string;
  label: string;
  values: string[];
};

type FilterBarProps = {
  filters: FilterDimension[];
  active: Record<string, string | null>;
  onChange: (key: string, value: string | null) => void;
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

- [ ] **Step 2: Verify build passes**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/FilterBar.tsx
git commit -m "refactor: generalize FilterBar key types to support any filter dimension"
```

---

## Task 4: Add product_category to shop grid + filter

**Files:**
- Modify: `src/app/shop/page.tsx`

- [ ] **Step 1: Replace the full content of shop/page.tsx**

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
  product_category?: string;
};

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
            product_category: data.product_category ?? '',
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
```

- [ ] **Step 2: Verify build passes**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/shop/page.tsx
git commit -m "feat: add product_category badge and Type filter to shop grid"
```

---

## Task 5: Product detail — category badge, size selector, Add to Cart

**Files:**
- Modify: `src/app/shop/[productId]/page.tsx`

This task replaces the full file, combining category display, size selector, and Add to Cart in one pass since all three are tightly coupled (size feeds into Add to Cart state).

- [ ] **Step 1: Replace the full content of [productId]/page.tsx**

```tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';

const CART_KEY = 'aiMerchCart';
const APPAREL = new Set(['shirt', 'hoodie', 'tote']);
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

type CartItem = {
  productId: string;
  productName: string;
  price?: number;
  assetId?: string;
  assetTitle?: string;
  mockupImageUrl?: string | null;
  quantity: number;
  size?: string;
};

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

function readCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.productId as string;

  const [product, setProduct] = useState<ProductDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);

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

        setProduct({
          id: snap.id,
          name: data.name ?? 'Unnamed product',
          description: data.description ?? '',
          price: typeof data.price === 'number' ? data.price : undefined,
          active: typeof data.active === 'boolean' ? data.active : true,
          mockupImageUrl: resolvedMockupUrl,
          defaultAssetId: data.defaultAssetId ?? null,
          product_category: data.product_category ?? '',
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
    const item: CartItem = {
      productId: product.id,
      productName: product.name,
      price: product.price,
      assetId: undefined,
      assetTitle: 'Original design',
      mockupImageUrl: product.mockupImageUrl,
      quantity: 1,
      size: selectedSize ?? undefined,
    };
    writeCart([...readCart(), item]);
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
```

- [ ] **Step 2: Verify build passes**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/shop/[productId]/page.tsx
git commit -m "feat: add category badge, size selector, and Add to Cart to product detail"
```

---

## Task 6: Cart — quantity stepper + size display

**Files:**
- Modify: `src/app/cart/page.tsx`

- [ ] **Step 1: Replace the full content of cart/page.tsx**

```tsx
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
  mockupImageUrl?: string | null;
  quantity: number;
  size?: string;
};

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
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      if (!raw) { setItems([]); return; }
      const parsed = JSON.parse(raw);
      setItems(Array.isArray(parsed) ? normalizeItems(parsed) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function saveCart(next: CartItem[]) {
    setItems(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CART_KEY, JSON.stringify(next));
    }
  }

  function handleClearCart() {
    if (typeof window !== 'undefined') window.localStorage.removeItem(CART_KEY);
    setItems([]);
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
                        ? `$${lineTotal.toFixed(2)}${item.quantity > 1 ? ` ($${priceNumber!.toFixed(2)} × ${item.quantity})` : ''}`
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
```

- [ ] **Step 2: Verify build passes**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/cart/page.tsx
git commit -m "feat: add quantity stepper and size display to cart; remove debug info"
```

---

## Task 7: Final verification + commit docs

- [ ] **Step 1: Run lint**

```bash
cd apps/frontend && npm run lint 2>&1 | tail -30
```
Expected: no errors (pre-existing `any` suppression warnings are acceptable)

- [ ] **Step 2: Start dev server and manually verify**

```bash
cd apps/frontend && npm run dev
```

Open `http://localhost:3000` and verify:

| Check | How to test | Expected |
|-------|-------------|----------|
| Homepage link | Click a Featured Product card | Goes to `/shop/[id]`, not 404 |
| No debug text | Open any product detail | No Product ID / URL text visible |
| No debug text | Add item, open `/cart` | No productId / assetId code text |
| Category badge on grid | Open `/shop` | Pill badge ("Shirt", "Mug" etc.) on cards that have `product_category` |
| Type filter | Open `/shop` | "Type" filter row appears; clicking a type filters the grid |
| Category on detail | Click a product | Category badge appears above the product name |
| Size selector shown | Open a Shirt or Hoodie product | XS S M L XL 2XL chips appear |
| Size selector hidden | Open a Mug product | No size chips |
| Size required | Shirt: click Add to Cart without selecting size | Button reads "Select a size", is disabled |
| Add to Cart works | Select size, click Add to Cart | Button shows "✓ Added to cart" for 2s; item in `/cart` |
| Quantity stepper | In `/cart`, click + on an item | Quantity increments; line price updates |
| Quantity minimum | Click − on quantity 1 | Quantity stays at 1 |
| Size in cart | Cart item for a sized product | "Size: M" (or selected size) shown |
| Cart total | Add 2 items × different quantities | Summary total = correct sum |

- [ ] **Step 3: Commit docs**

```bash
git add docs/
git commit -m "docs: add shop functional spec and implementation plan"
```

---

## Self-Review

**Spec coverage:**
- ✅ Fix broken homepage link → Task 1
- ✅ Remove debug panels → Task 2
- ✅ Generalize FilterBar → Task 3
- ✅ Category badge + Type filter on shop grid → Task 4
- ✅ Category badge on product detail → Task 5
- ✅ Add to Cart from product detail → Task 5
- ✅ Size selector (apparel only) → Task 5
- ✅ Quantity controls in cart → Task 6
- ✅ Size display in cart → Task 6

**Type consistency:**
- `CartItem` shape (`quantity: number`, `size?: string`) is identical in Task 5 (writer) and Task 6 (reader). ✅
- `normalizeItems` in cart/page.tsx gracefully handles old cart items missing `quantity` by defaulting to 1. ✅
- `CART_KEY = 'aiMerchCart'` matches across both files. ✅
- `categoryLabel()` duplicated in shop/page.tsx and [productId]/page.tsx — acceptable for now, extract to `src/lib/categoryLabel.ts` in a future cleanup. ✅

**No placeholders:** All steps contain complete replacement code. ✅
