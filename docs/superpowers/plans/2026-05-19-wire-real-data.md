# Wire Real Data — Homepage Product Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded placeholder arrays on the homepage with live Firestore reads, add a `featured` flag to products, and expose it in the admin forms.

**Architecture:** Two focused `'use client'` components (`FeaturedProducts`, `NewArrivals`) are extracted into `src/components/home/` and imported by the Server Component `page.tsx`. Each component owns its own Firestore query via two new named hook exports added to `useProducts.ts`. The admin create and edit forms gain a `featured` checkbox that writes the flag to Firestore.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, TypeScript 5, Firebase Firestore v9 modular SDK. All commands run from `apps/frontend/`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/types.ts` | Modify | Add `featured?: boolean`, `createdAt?: number` to `Product` |
| `src/hooks/useProducts.ts` | Modify | Add `useFeaturedProducts()` and `useRecentProducts(count)` exports |
| `src/components/home/FeaturedProducts.tsx` | **Create** | Client component — Featured Products section with loading/empty/error/data states |
| `src/components/home/NewArrivals.tsx` | **Create** | Client component — New Arrivals section with loading/empty/error/data states |
| `src/app/page.tsx` | Modify | Replace two hardcoded sections with `<FeaturedProducts />` and `<NewArrivals />` |
| `src/app/admin/products/new/page.tsx` | Modify | Add `featured` state, checkbox, and Firestore write |
| `src/app/admin/products/[productId]/page.tsx` | Modify | Add `featured` to `ProductState`, load, checkbox, and Firestore write |

---

## CSS / Design Tokens Reference

Defined in `src/app/globals.css` — use these Tailwind classes:

```
text-primary   → #f0f0f0 (white-ish)
text-muted     → #9ca3af (gray)
text-accent    → #00FF41 (neon green)
bg-secondary   → #111111 (dark card bg)
bg-background  → #0a0a0a (page bg)
border-white/5, border-white/8, border-white/20 → subtle dark borders
```

---

## Task 1: Update Product Type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the two new optional fields**

Replace the entire file contents:

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
  createdAt?: number;
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add featured and createdAt fields to Product type"
```

---

## Task 2: Add Hook Exports

**Files:**
- Modify: `src/hooks/useProducts.ts`

The existing `useProducts()` function is **not touched**. Add `limit` to the Firestore import, then append two new named exports at the bottom of the file.

- [ ] **Step 1: Add `limit` to the Firestore import**

Find the existing import line (line 2):

```ts
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
```

Replace it with:

```ts
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
```

- [ ] **Step 2: Append the two new exports after the closing brace of `useProducts`**

```ts
export function useFeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'products'),
          where('active', '==', true),
          where('featured', '==', true),
          orderBy('name', 'asc'),
          limit(4),
        );
        const snap = await getDocs(q);
        setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load featured products');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return { products, loading, error };
}

export function useRecentProducts(count: number) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'products'),
          where('active', '==', true),
          orderBy('createdAt', 'desc'),
          limit(count),
        );
        const snap = await getDocs(q);
        setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load recent products');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [count]);

  return { products, loading, error };
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useProducts.ts
git commit -m "feat: add useFeaturedProducts and useRecentProducts hooks"
```

---

## Task 3: Create FeaturedProducts Component

**Files:**
- Create: `src/components/home/FeaturedProducts.tsx`

The `src/components/home/` directory does not exist yet — create it by creating the file directly (no mkdir needed).

- [ ] **Step 1: Create the file**

```tsx
'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useFeaturedProducts } from '@/hooks/useProducts';

export function FeaturedProducts() {
  const { products, loading, error } = useFeaturedProducts();

  return (
    <section className="border-t border-white/5 bg-secondary px-6 py-14">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <p className="mb-1 text-xs tracking-[0.3em] text-accent uppercase">Shop</p>
            <h2 className="text-2xl font-bold text-primary">Featured Products</h2>
          </div>
          <Link
            href="/products"
            className="border-b border-muted/40 pb-0.5 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
          >
            View All →
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2">
          {loading && [0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="min-w-[160px] flex-shrink-0 animate-pulse overflow-hidden rounded-lg border border-white/8 bg-background"
            >
              <div className="h-[120px] bg-white/5" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-3/4 rounded bg-white/10" />
                <div className="h-4 w-1/2 rounded bg-white/10" />
              </div>
            </div>
          ))}

          {!loading && error && (
            <p className="text-xs text-muted">Couldn&apos;t load products</p>
          )}

          {!loading && !error && products.length === 0 && (
            <p className="text-xs text-muted">New products coming soon</p>
          )}

          {!loading && !error && products.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="min-w-[160px] flex-shrink-0 overflow-hidden rounded-lg border border-white/8 bg-background transition-colors hover:border-white/20"
            >
              <div className="relative h-[120px] bg-white/5">
                {p.mockupImageUrl ? (
                  <Image
                    src={p.mockupImageUrl}
                    alt={p.name}
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="h-12 w-12 rounded bg-white/10" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="mb-1 text-xs text-muted">{p.name}</p>
                <p className="text-sm font-semibold text-primary">
                  {typeof p.price === 'number' ? `$${p.price.toFixed(2)}` : 'Price TBA'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/FeaturedProducts.tsx
git commit -m "feat: add FeaturedProducts client component"
```

---

## Task 4: Create NewArrivals Component

**Files:**
- Create: `src/components/home/NewArrivals.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRecentProducts } from '@/hooks/useProducts';

export function NewArrivals() {
  const { products, loading, error } = useRecentProducts(6);

  return (
    <section className="border-t border-white/5 bg-secondary px-6 py-14">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <p className="mb-1 text-xs tracking-[0.3em] text-accent uppercase">Shop</p>
            <h2 className="text-2xl font-bold text-primary">New Arrivals</h2>
          </div>
          <Link
            href="/products"
            className="border-b border-muted/40 pb-0.5 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
          >
            Browse All →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {loading && [0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-lg border border-white/8 bg-background"
            >
              <div className="h-[100px] bg-white/5" />
              <div className="space-y-1 p-3">
                <div className="h-3 w-3/4 rounded bg-white/10" />
                <div className="h-3 w-1/3 rounded bg-white/10" />
              </div>
            </div>
          ))}

          {!loading && error && (
            <p className="col-span-2 text-xs text-muted md:col-span-3">
              Couldn&apos;t load products
            </p>
          )}

          {!loading && !error && products.length === 0 && (
            <p className="col-span-2 text-center text-xs text-muted md:col-span-3">
              No products yet — check back soon
            </p>
          )}

          {!loading && !error && products.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="overflow-hidden rounded-lg border border-white/8 bg-background transition-colors hover:border-white/20"
            >
              <div className="relative h-[100px] bg-white/5">
                {p.mockupImageUrl ? (
                  <Image
                    src={p.mockupImageUrl}
                    alt={p.name}
                    fill
                    sizes="(min-width: 768px) 33vw, 50vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full bg-white/5" />
                )}
              </div>
              <div className="p-3">
                <p className="text-xs text-muted">{p.name}</p>
                <p className="text-xs text-muted">
                  {typeof p.price === 'number' ? `$${p.price.toFixed(2)}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/NewArrivals.tsx
git commit -m "feat: add NewArrivals client component"
```

---

## Task 5: Wire Components into Homepage

**Files:**
- Modify: `src/app/page.tsx`

`page.tsx` is a Server Component (no `'use client'`). Importing `'use client'` components from a Server Component is valid in Next.js App Router — no changes to `page.tsx`'s own directive needed.

- [ ] **Step 1: Add the two imports at the top of the file**

After the existing `import Link from 'next/link';` line, add:

```tsx
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { NewArrivals } from '@/components/home/NewArrivals';
```

- [ ] **Step 2: Replace the Featured Products section**

Find and remove the entire Featured Products `<section>` block (currently section 2, which starts with `{/* ── 2. FEATURED PRODUCTS` and ends with its closing `</section>`). Replace it with:

```tsx
      {/* ── 2. FEATURED PRODUCTS ─────────────────────────────── */}
      <FeaturedProducts />
```

- [ ] **Step 3: Replace the New Arrivals section**

Find and remove the entire New Arrivals `<section>` block (currently section 5, which starts with `{/* ── 5. NEW ARRIVALS GRID` and ends with its closing `</section>`). Replace it with:

```tsx
      {/* ── 5. NEW ARRIVALS GRID ─────────────────────────────── */}
      <NewArrivals />
```

- [ ] **Step 4: Run lint and TypeScript check**

```bash
npm run lint && npx tsc --noEmit
```

Expected: no errors in `page.tsx` or the two new components.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: replace hardcoded homepage sections with live Firebase components"
```

---

## Task 6: Add featured to Admin New Product Form

**Files:**
- Modify: `src/app/admin/products/new/page.tsx`

Three changes: add state, add checkbox in the form, add the field to the Firestore write.

- [ ] **Step 1: Add `featured` state**

Find the line:
```ts
const [active, setActive] = useState(true);
```

Add directly after it:
```ts
const [featured, setFeatured] = useState(false);
```

- [ ] **Step 2: Add `featured` to the Firestore `addDoc` call**

Find the `addDoc` call in `handleSubmit`. It currently ends with:
```ts
        active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
```

Add `featured` after `active`:
```ts
        active,
        featured,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
```

- [ ] **Step 3: Add the `featured` checkbox to the form**

Find the Active toggle block:
```tsx
          {/* Active toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <input
              id="active"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <label htmlFor="active" style={{ fontSize: '0.9rem' }}>
              Active (show in shop)
            </label>
          </div>
```

Add the `featured` checkbox immediately after that closing `</div>`:
```tsx
          {/* Featured toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <input
              id="featured"
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
            <label htmlFor="featured" style={{ fontSize: '0.9rem' }}>
              Featured (show on homepage)
            </label>
          </div>
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/products/new/page.tsx
git commit -m "feat: add featured checkbox to admin new product form"
```

---

## Task 7: Add featured to Admin Edit Product Form

**Files:**
- Modify: `src/app/admin/products/[productId]/page.tsx`

Four changes: add `featured` to `ProductState`, read it on load, add checkbox in the form, write it on save.

- [ ] **Step 1: Add `featured` to `ProductState`**

Find:
```ts
type ProductState = {
  name: string;
  description: string;
  priceInput: string;
  mockupImageUrl: string;
  defaultAssetId: string;
  active: boolean;
};
```

Replace with:
```ts
type ProductState = {
  name: string;
  description: string;
  priceInput: string;
  mockupImageUrl: string;
  defaultAssetId: string;
  active: boolean;
  featured: boolean;
};
```

- [ ] **Step 2: Read `featured` from Firestore on load**

Find the `state` object construction inside the `load` function:
```ts
        const state: ProductState = {
          name: data.name ?? '',
          description: data.description ?? '',
          priceInput: typeof data.price === 'number' ? String(data.price) : '',
          mockupImageUrl: data.mockupImageUrl ?? '',
          defaultAssetId: data.defaultAssetId ?? '',
          active: typeof data.active === 'boolean' ? data.active : true,
        };
```

Replace with:
```ts
        const state: ProductState = {
          name: data.name ?? '',
          description: data.description ?? '',
          priceInput: typeof data.price === 'number' ? String(data.price) : '',
          mockupImageUrl: data.mockupImageUrl ?? '',
          defaultAssetId: data.defaultAssetId ?? '',
          active: typeof data.active === 'boolean' ? data.active : true,
          featured: typeof data.featured === 'boolean' ? data.featured : false,
        };
```

- [ ] **Step 3: Add `featured` to the `updateDoc` call**

Find:
```ts
      await updateDoc(ref, {
        name: product.name.trim(),
        description: product.description.trim(),
        price: priceNumber,
        mockupImageUrl: product.mockupImageUrl.trim() || null,
        defaultAssetId: product.defaultAssetId.trim() || null,
        active: product.active,
        updatedAt: serverTimestamp(),
      });
```

Replace with:
```ts
      await updateDoc(ref, {
        name: product.name.trim(),
        description: product.description.trim(),
        price: priceNumber,
        mockupImageUrl: product.mockupImageUrl.trim() || null,
        defaultAssetId: product.defaultAssetId.trim() || null,
        active: product.active,
        featured: product.featured,
        updatedAt: serverTimestamp(),
      });
```

- [ ] **Step 4: Add the `featured` checkbox to the form**

Find the Active toggle block:
```tsx
          {/* Active toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <input
              id="active"
              type="checkbox"
              checked={product.active}
              onChange={(e) => handleFieldChange('active', e.target.checked)}
            />
            <label htmlFor="active" style={{ fontSize: '0.9rem' }}>
              Active (show in shop)
            </label>
          </div>
```

Add the `featured` checkbox immediately after that closing `</div>`:
```tsx
          {/* Featured toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <input
              id="featured"
              type="checkbox"
              checked={product.featured}
              onChange={(e) => handleFieldChange('featured', e.target.checked)}
            />
            <label htmlFor="featured" style={{ fontSize: '0.9rem' }}>
              Featured (show on homepage)
            </label>
          </div>
```

- [ ] **Step 5: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/products/[productId]/page.tsx"
git commit -m "feat: add featured checkbox to admin edit product form"
```

---

## Task 8: Verification

**Files:** none modified (build verification only)

- [ ] **Step 1: Run full lint**

```bash
npm run lint
```

Expected: no new errors in Sprint 4 files. Pre-existing warnings in `CartContext.tsx`, `useAuth.ts`, etc. are unrelated — ignore them.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: build completes successfully. The homepage (`/`) appears as a static route. `FeaturedProducts` and `NewArrivals` will appear as client boundaries in the build output.

- [ ] **Step 4: Start dev server and visual check**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify:
- Featured Products section shows skeleton cards (animate-pulse) while loading, then either real products or "New products coming soon"
- New Arrivals section shows 6 skeleton cards while loading, then either real products or "No products yet — check back soon"
- No layout shift between loading and empty/data states
- No JavaScript errors in browser console

> **Note on Firestore indexes:** The first time the app runs with real data, Firestore will likely throw an error for the composite indexes. The error message contains a direct Firebase console link — click it to create the index (takes ~1 minute). Until created, the affected section shows its error state ("Couldn't load products") while the rest of the page renders normally.
>
> Indexes needed:
> - `products`: `active` (asc) + `featured` (asc) + `name` (asc)
> - `products`: `active` (asc) + `createdAt` (desc)

- [ ] **Step 5: Commit any fixes**

If steps 1–4 required fixes, commit them:

```bash
git add -p
git commit -m "fix: wire real data verification corrections"
```

If no fixes were needed, skip this step.
