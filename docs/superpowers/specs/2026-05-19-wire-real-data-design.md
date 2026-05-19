# Design Spec: Wire Real Data — Homepage Product Sections

**Date:** 2026-05-19
**Sprint:** 4
**Branch:** `feature/sprint-4-wire-real-data`

---

## Goal

Replace the hardcoded placeholder arrays in the homepage Featured Products and New Arrivals sections with live Firestore reads. Add a `featured` flag to the product data model and expose it in the admin create/edit forms.

---

## Scope

Seven files changed. No new directories.

| File | Action |
|---|---|
| `src/lib/types.ts` | Add `featured?: boolean`, `createdAt?: number` to `Product` |
| `src/hooks/useProducts.ts` | Add `useFeaturedProducts()` and `useRecentProducts(limit)` exports |
| `src/components/home/FeaturedProducts.tsx` | Create — client component for Featured Products section |
| `src/components/home/NewArrivals.tsx` | Create — client component for New Arrivals section |
| `src/app/page.tsx` | Replace two hardcoded sections with `<FeaturedProducts />` and `<NewArrivals />` |
| `src/app/admin/products/new/page.tsx` | Add `featured` checkbox |
| `src/app/admin/products/[productId]/page.tsx` | Add `featured` checkbox to edit form |

---

## Data Model

### `Product` type (`src/lib/types.ts`)

Add two optional fields:

```ts
featured?: boolean    // true = appears in Featured Products section on homepage
createdAt?: number    // Firestore serverTimestamp — already written by admin create form
```

`createdAt` is already written by the admin create form via `serverTimestamp()`. Products created before this sprint that lack `createdAt` will sort to the bottom of New Arrivals (Firestore treats missing fields as smallest value).

`featured` defaults to `false` / absent for all existing products. The edit form reads it with `data.featured ?? false` so existing products behave correctly without a migration.

---

## Firestore Queries

### `useFeaturedProducts()`

```
collection: products
filters:  active == true, featured == true
orderBy:  name asc
limit:    4
```

### `useRecentProducts(limit: number)`

```
collection: products
filters:  active == true
orderBy:  createdAt desc
limit:    caller-supplied (homepage passes 6)
```

### Composite indexes required

Both queries require composite indexes. Create in Firebase console:

| Collection | Fields | Order |
|---|---|---|
| `products` | `active` asc, `featured` asc, `name` asc | — |
| `products` | `active` asc, `createdAt` desc | — |

Firestore will return an error containing a direct console link if an index is missing — follow the link to create it. The app degrades gracefully: the affected section shows its error state while the rest of the page renders normally.

---

## Hook Changes (`src/hooks/useProducts.ts`)

Add two named exports alongside the existing `useProducts()`:

### `useFeaturedProducts()`

```ts
export function useFeaturedProducts() {
  // query: active==true, featured==true, orderBy name asc, limit 4
  // returns: { products: Product[], loading: boolean, error: string | null }
}
```

### `useRecentProducts(limit: number)`

```ts
export function useRecentProducts(limit: number) {
  // query: active==true, orderBy createdAt desc, limit N
  // returns: { products: Product[], loading: boolean, error: string | null }
}
```

The existing `useProducts()` export is **unchanged**. `/shop`, `/products`, and any other consumers keep working.

---

## Component Design

### `FeaturedProducts.tsx` (`src/components/home/`)

`'use client'` component. Owns the full Featured Products `<section>` from `page.tsx` (heading, "View All →" link, and the card scroll row).

**Render states:**

| State | Output |
|---|---|
| Loading | 4 skeleton cards — same `min-w-[160px]` shape, gray placeholder box + muted lines, `animate-pulse` |
| Empty | Scroll row replaced with a single muted line: "New products coming soon" |
| Error | Muted error line: "Couldn't load products" — section stays in layout |
| Data | 4 cards, each a `<Link href="/products/[id]">` |

**Card anatomy (data state):**
- 120px image area: `<Image>` with `mockupImageUrl` if set; placeholder gray box if null
- Below: `name` (xs, muted) and formatted `price` (sm, bold, primary)
- Full card is the link — no separate button

### `NewArrivals.tsx` (`src/components/home/`)

`'use client'` component. Owns the full New Arrivals `<section>` (heading, "Browse All →" link, and the grid).

**Render states:**

| State | Output |
|---|---|
| Loading | 6 skeleton cards in `grid-cols-2 md:grid-cols-3`, `animate-pulse` |
| Empty | "No products yet — check back soon" centered in the grid area |
| Error | Muted error line: "Couldn't load products" |
| Data | 6 cards, each a `<Link href="/products/[id]">` |

**Card anatomy (data state):**
- 100px image area: `<Image>` with `mockupImageUrl` if set; placeholder gray box if null
- Below: `name` (xs, muted) and formatted `price` (xs, muted)
- Full card is the link

### `page.tsx` changes

Remove the two hardcoded `<section>` blocks. Replace with:

```tsx
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { NewArrivals } from '@/components/home/NewArrivals';

// Inside the return, in position:
<FeaturedProducts />   {/* replaces section 2 */}
<NewArrivals />        {/* replaces section 5 */}
```

`page.tsx` remains a Server Component. Hero, How It Works, and AI Studio Teaser sections are untouched.

---

## Admin Form Changes

### New product form (`admin/products/new/page.tsx`)

Add `featured` state:
```ts
const [featured, setFeatured] = useState(false);
```

Add checkbox in form, visually grouped with the existing `active` checkbox:
```tsx
<input type="checkbox" id="featured" checked={featured}
  onChange={(e) => setFeatured(e.target.checked)} />
<label htmlFor="featured">Featured (show on homepage)</label>
```

Write to Firestore on submit:
```ts
featured,   // added alongside existing fields
```

### Edit product form (`admin/products/[productId]/page.tsx`)

Read on load:
```ts
setFeatured(data.featured ?? false);
```

Same checkbox in form. Write `featured` on save alongside existing fields.

---

## What Does Not Change

- `useProducts()` — existing export, signature, and behaviour unchanged
- `/shop/page.tsx`, `/products/page.tsx` — no changes
- Homepage Hero, How It Works, AI Studio Teaser sections — untouched
- All existing product fields (`name`, `description`, `price`, `active`, `mockupImageUrl`, `defaultAssetId`)
- No database migration — `featured` defaults to absent/false; `createdAt` already present on new products

---

## Success Criteria

1. Homepage Featured Products section shows real products with `featured: true` and `active: true` from Firestore (or empty state if none exist)
2. Homepage New Arrivals section shows the 6 most recently created active products from Firestore
3. Each product card links correctly to `/products/[productId]`
4. Loading skeletons render while data fetches — no layout shift
5. Empty and error states render without breaking the page layout
6. Admin create form saves `featured` field to Firestore
7. Admin edit form reads and writes `featured` field correctly
8. `useProducts()` (existing export) continues to work — `/shop` unaffected
9. `npm run build` passes with no new type errors or lint warnings
