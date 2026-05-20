# Sprint 5 Design: Studio-to-Product Flow

**Date:** 2026-05-20  
**Status:** Approved  
**Scope:** Customer-facing flow to browse or generate AI art, apply it to a product via Konva canvas, save the mockup, and add to cart.

---

## Overview

This sprint closes the loop between the AI Studio and the storefront. Customers can either browse the catalog of n8n-generated assets or generate their own, then compose their chosen art onto a product mockup using a drag-and-scale canvas, and add the customized product to their cart.

**Out of scope (Sprint 6):** Prompt remix (edit original prompt and regenerate from a template asset).

---

## User & Auth

- **Primary user:** Customer (mobile-first)
- **Auth:** Guest allowed — no login required for the studio flow. Auth is only prompted at checkout (existing behavior).
- **Secondary user:** Admin/operator can use the same flow to preview how art looks on products.

---

## Route Architecture

Three new routes, one linear pipeline. All state is carried in URL params — browser back, deep-links, and shareable URLs all work natively.

### New Routes

| Route | Purpose |
|---|---|
| `/studio/gallery` | Browse published assets + "Generate New" CTA |
| `/studio/apply?assetId=X` | Pick a product to apply the selected asset to |
| `/studio/compose?assetId=X&productId=Y` | Konva canvas — position art, save mockup, add to cart |

### Entry Points

**Browse-first (new customer path):**
```
/studio/gallery → /studio/apply?assetId=X → /studio/compose?assetId=X&productId=Y → /cart
```

**Generate-first (existing studio user):**
```
/studio/generate → [result card "Apply to Product →"] → /studio/apply?assetId=X → ...
```

**Product-first (from product detail page):**
```
/products/[productId] → "Customize with AI" → /studio/compose?assetId=[defaultAssetId]&productId=Y
```
Skips gallery and apply entirely — lands directly on canvas.

---

## New Files

### `src/hooks/useAssets.ts`

Two exports:

- `useAssets(count = 20)` — queries `assets` Firestore collection, `orderBy('createdAt', 'desc')`, `limit(count)`. No published filter (no admin publish UI exists yet — n8n assets appear automatically). Returns `{ assets, loading, error }`.
- `getAsset(id: string): Promise<Asset | null>` — fetches a single asset doc by ID.

### `src/lib/types.ts` — Asset interface (addition)

```ts
export interface Asset {
  id: string;
  title: string;
  niche?: string;
  imageUrl: string;
  thumbUrl?: string;
  prompt?: string;
  source?: string;
  createdAt?: number;
}
```

### `src/app/studio/gallery/page.tsx`

- `'use client'`
- Calls `useAssets(20)`
- Layout: "Generate New Art" CTA banner at top (links to `/studio/generate`) + 2-col mobile / 3-col desktop grid of asset cards
- Asset card: image (square aspect ratio), title, niche badge
- Selection: tap card → border highlight (`border-accent`). CTA "Use This Art →" activates once a card is selected → navigates to `/studio/apply?assetId=X`
- Four render states: loading skeletons · empty ("No art yet — be the first to generate!") · error · data grid

### `src/app/studio/apply/page.tsx`

- `'use client'`
- Reads `assetId` from `useSearchParams()` — component must be wrapped in `<Suspense>` in the page (Next.js App Router requirement)
- Fetches selected asset with `getAsset(assetId)` for the preview thumbnail
- Calls `useProducts()` for the product list (existing hook, returns active products)
- Layout: selected asset thumbnail at top with "Change" link (`← /studio/gallery`) + scrollable product list
- Product row: mockup image thumbnail, name, price. Tap to select.
- CTA "Compose Design →" activates once a product is selected → navigates to `/studio/compose?assetId=X&productId=Y`
- Handles: missing `assetId` param → redirect to `/studio/gallery`

### `src/app/studio/compose/page.tsx`

- `'use client'`
- Reads `assetId` + `productId` from `useSearchParams()` — component must be wrapped in `<Suspense>` in the page
- Fetches asset (`getAsset`) and product (`getProduct` from `useProducts`) on mount
- Renders `KonvaComposer` (dynamic import, `ssr: false`) once both are loaded
- Holds `stageRef` (passed to KonvaComposer) and a `saving` boolean
- **"Save & Add to Cart" handler:**
  1. `const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 })`
  2. `POST /api/save-mockup { dataUrl, assetId, productId }` → `{ id, imageUrl }`
  3. `addItem({ ...product, mockupImageUrl: imageUrl }, 1, assetId)` (CartContext unchanged)
  4. `router.push('/cart')`
- Error state: toast notification, canvas stays interactive for retry
- Saving state: spinner overlay on canvas, button disabled
- "Change product" link → `/studio/apply?assetId=X`

### `src/components/studio/KonvaComposer.tsx`

Client-only Konva component. Always consumed via `dynamic(() => import(...), { ssr: false })`.

**Props:**
```ts
interface KonvaComposerProps {
  assetUrl: string;         // DALL-E generated image URL
  productMockupUrl: string; // product base image (blank product, no art)
  stageRef: RefObject<Konva.Stage>;
}
```

**Implementation:**
- `Stage` sized at 600×600px internally, CSS-scaled to fit screen width
- Layer 1 (background): `Image` node loaded from `productMockupUrl` — `listening={false}`, fills the stage
- Layer 2 (foreground): `Image` node loaded from `assetUrl` — draggable, centered on first render at ~40% of stage size
- `Transformer` attached to foreground image node — provides corner resize handles and pinch-to-scale on mobile
- Uses `useImage` hook from `use-image` package (needs `npm install use-image` — not yet in package.json)

**Export:** Caller calls `stageRef.current.toDataURL({ pixelRatio: 2 })` — returns a 1200×1200px PNG data URL.

---

## Modified Files

### `src/app/studio/generate/page.tsx`

Each result card currently shows a "Saved ✓" badge. Add an "Apply to Product →" button below the image that navigates to `/studio/apply?assetId={asset.id}`.

### `src/app/products/[productId]/page.tsx`

The "Customize with AI" button currently links to `/studio?productId=X&assetId=Y`. Update to `/studio/compose?assetId=[product.defaultAssetId]&productId=X`.

If `product.defaultAssetId` is null, the button remains disabled ("Customization Locked") — existing behavior unchanged.

---

## Data Layer

### Firestore collections used

| Collection | Used by | Query |
|---|---|---|
| `assets` | gallery, apply, compose | `orderBy createdAt desc`, single doc fetch by ID |
| `products` | apply, compose | `useProducts()` (existing), `getProduct(id)` (existing) |
| `mockups` | compose (write) | `/api/save-mockup` writes here — no new client query |

### No new Firestore indexes required

- `assets` gallery query: `orderBy createdAt desc` — single-field index, auto-created by Firestore.
- `products` query: reuses existing `useProducts()` hook.

---

## CartContext Integration

`CartContext` already supports `assetId` on `CartItem` and per-variant deduplication. No changes needed.

The compose page passes a modified product object to `addItem`:
```ts
addItem({ ...product, mockupImageUrl: savedMockupUrl }, 1, assetId)
```

The cart displays `mockupImageUrl` as the item image — customers see their custom design in the cart.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `assetId` missing from URL on `/studio/apply` | Redirect to `/studio/gallery` |
| `assetId` or `productId` missing on `/studio/compose` | Redirect to `/studio/gallery` |
| Asset or product not found in Firestore | Show "Not found" with back link |
| `/api/save-mockup` fails | Show error toast, keep canvas interactive, re-enable button |
| Product has no `mockup_base_image` | Show plain dark background on canvas (no crash) |
| KonvaComposer image load fails | Show placeholder rectangle in place of broken image |

---

## Deferred to Sprint 6

- **Prompt Remix:** "Use as template" path — customer edits the original prompt, regenerates a new DALL-E image from the template, then proceeds to apply.
- **Unified Studio Workspace:** Desktop-optimized `/studio` page with asset panel, canvas, and product panel side-by-side (Option C from design).
- **Published filter on gallery:** Admin UI to mark assets as published. Once that exists, gallery switches to `where('published', '==', true)`.
