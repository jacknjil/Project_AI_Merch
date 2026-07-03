# Studio-to-Cart Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing-but-dormant "choose a product, then compose your design onto it" flow (`/studio/apply` → `/studio/compose`) actually reach checkout, by unifying it onto the same cart/checkout pipeline the live `/shop` flow already uses, fixing the bugs blocking each flow individually, and giving it real product-template data to work with.

**Architecture:** Two commerce flows exist today and were built independently: `/shop` (pre-published fixed Printify SKUs, real cart, real checkout, 8 live products) and `/studio/apply → /studio/compose` (pick a blank product template, live-composite a design onto it via Konva, currently writes to a cart the checkout page never reads). This plan makes the flat `localStorage['aiMerchCart']` contract — already consumed by `/api/create-checkout-session` — the single source of truth for both flows, fixes the two bugs found in `/shop`'s Printify mockup/sibling-switcher code, and scopes (but does not yet fully implement) populating real product templates and mapping Konva placement data into a Printify print job.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Firebase (client SDK + Admin SDK), Konva/react-konva, Stripe Checkout, Printify REST API.

## Global Constraints

- No new test framework this project — every task ends in `npx tsc --noEmit` + manual dev-server/Playwright verification, matching this repo's existing convention (no Jest/Vitest/testing-library exists today; user confirmed 2026-07-03 to keep it that way for cost reasons).
- Run all `npm`/`npx` commands from `apps/frontend/` with Node 20 (`nvm use` first).
- Default to Sonnet for all tasks; only escalate to Opus for Phase 4 Task 2 (Konva→Printify coordinate mapping), which is genuinely gnarly reasoning, not mechanical.
- Canonical cart item shape (already relied on by checkout — do not change these field names):
  ```ts
  type FlatCartItem = {
    id?: string;
    productId: string;
    productName: string;
    price: number;
    assetId?: string;
    assetTitle?: string;
    mockupImageUrl?: string | null;
    quantity: number;
    size?: string | null;
  };
  ```
  Stored at `localStorage['aiMerchCart']`. Consumed by `src/app/cart/page.tsx` and `src/app/api/create-checkout-session/route.ts` (as `CheckoutItemPayload`, a superset of the above).
- Fulfillment is **manual for every order today** (confirmed in `src/app/api/stripe-webhook/route.ts:78-82`): a successful Stripe payment creates a Firestore `orders` doc with `fulfillment.status: 'unfulfilled'` and an explicit comment `// you'll update this manually later`. Phase 4 must reach parity with this manual pattern — it must NOT attempt to build new automated Printify order submission, which doesn't exist for `/shop` either.
- Printify's product `images[]` field returns exactly one photo per unique enabled color variant on that product — it is not a multi-scene mockup library. Verified live 2026-07-03 across all 8 currently-published `/shop` products (each returned exactly 1 image, one returned 0). Do not design around an assumption that a single product can expose multiple distinct "scene" photos.

---

## Phase 1: Cart Unification

**Why first:** `/studio/compose`'s "Save & Add to Cart" currently writes to `CartContext` → `localStorage['ai_merch_cart']`. `/cart/page.tsx` only reads `localStorage['aiMerchCart']` (different key, different shape). Items added via Studio silently never reach checkout. Every later phase assumes this is fixed.

### Task 1: Create the shared cart module

**Files:**
- Create: `apps/frontend/src/lib/cart.ts`
- Modify: none yet (consumers migrated in later tasks)

**Interfaces:**
- Produces: `CART_KEY` (string constant `'aiMerchCart'`), `FlatCartItem` type (per Global Constraints), `readCart(): FlatCartItem[]`, `writeCart(items: FlatCartItem[]): void`, `addToCart(item: Omit<FlatCartItem, 'quantity'> & { quantity?: number }): void` (merges on matching `productId` + `size` + `assetId`, incrementing quantity), `removeFromCart(productId: string, opts?: { assetId?: string | null }): void`, `getCartCount(): number`. `writeCart` must dispatch a `window.dispatchEvent(new Event('cart-updated'))` after writing, since native `storage` events don't fire in the tab that wrote them — Header/CartSheet (Task 4) need this to update their badge without a page reload.

- [ ] **Step 1: Write `src/lib/cart.ts`**

```ts
// src/lib/cart.ts
export const CART_KEY = 'aiMerchCart';

export type FlatCartItem = {
  id?: string;
  productId: string;
  productName: string;
  price: number;
  assetId?: string;
  assetTitle?: string;
  mockupImageUrl?: string | null;
  quantity: number;
  size?: string | null;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function readCart(): FlatCartItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCart(items: FlatCartItem[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('cart-updated'));
}

export function addToCart(
  item: Omit<FlatCartItem, 'quantity'> & { quantity?: number },
): void {
  const existing = readCart();
  const quantity = item.quantity ?? 1;

  const matchIdx = existing.findIndex(
    (i) =>
      i.productId === item.productId &&
      (i.size ?? null) === (item.size ?? null) &&
      (i.assetId ?? null) === (item.assetId ?? null),
  );

  let updated: FlatCartItem[];
  if (matchIdx >= 0) {
    updated = existing.map((i, idx) =>
      idx === matchIdx ? { ...i, quantity: i.quantity + quantity } : i,
    );
  } else {
    updated = [...existing, { ...item, quantity }];
  }

  writeCart(updated);
}

export function removeFromCart(
  productId: string,
  opts: { assetId?: string | null } = {},
): void {
  const assetId = opts.assetId ?? null;
  const existing = readCart();
  const updated = existing.filter((item) => {
    if (item.productId !== productId) return true;
    if (assetId !== null && (item.assetId ?? null) !== assetId) return true;
    if (assetId === null && item.assetId) return true;
    return false;
  });
  writeCart(updated);
}

export function getCartCount(): number {
  return readCart().reduce((total, item) => total + (item.quantity || 0), 0);
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no new errors from `src/lib/cart.ts` (existing consumers not yet migrated, so their own inline types still compile independently).

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open browser console at `http://localhost:3000`, run:
```js
localStorage.removeItem('aiMerchCart');
```
(clears any stray state before Task 2 testing begins).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/lib/cart.ts
git commit -m "feat: add shared cart module as single source of truth for aiMerchCart"
```

### Task 2: Migrate `/shop/[productId]` and `/cart` to the shared module

**Files:**
- Modify: `apps/frontend/src/app/shop/[productId]/page.tsx:134-184` (the `handleAddToCart` function and its inline `CART_KEY`/`FlatCartItem`)
- Modify: `apps/frontend/src/app/cart/page.tsx:1-24` (inline `CART_KEY`/`CartItem` type/`normalizeItems`) and wherever it calls `saveCart`/reads localStorage directly

**Interfaces:**
- Consumes: `readCart`, `writeCart`, `addToCart`, `FlatCartItem` from `@/lib/cart` (Task 1).

- [ ] **Step 1: Replace `/shop/[productId]`'s inline cart logic**

In `apps/frontend/src/app/shop/[productId]/page.tsx`, delete lines 137-147 (the inline `CART_KEY`/`FlatCartItem` declarations) and replace the body of `handleAddToCart` (lines 149-182) with:

```ts
  function handleAddToCart() {
    if (!product) return;

    addToCart({
      productId: product.id,
      productName: product.title,
      price: 25,
      mockupImageUrl: product.mockupUrl ?? product.imageUrl ?? null,
      assetTitle: product.title,
      size: selectedSize,
    });

    setAddedToCart(true);
  }
```

Add the import at the top of the file: `import { addToCart } from '@/lib/cart';`

(Note: keep whatever price-resolution logic already existed for `product.price` if the asset type carries a real price field — re-check the surrounding code for the actual price source before hardcoding `25`; the original code used `product.price ?? 25`, preserve that exact expression if `product.price` exists on the loaded doc.)

- [ ] **Step 2: Replace `/cart/page.tsx`'s inline cart logic**

In `apps/frontend/src/app/cart/page.tsx`, replace the top-of-file constant/type (lines 6-17) by deleting them and adding:

```ts
import { readCart, writeCart, type FlatCartItem } from '@/lib/cart';
```

Replace the `useEffect` localStorage read (lines 32-44) with:

```ts
  useEffect(() => {
    setItems(normalizeItems(readCart()));
    setLoading(false);
  }, []);
```

Replace `saveCart` (lines 46-50) with:

```ts
  function saveCart(next: FlatCartItem[]) {
    setItems(next);
    writeCart(next);
  }
```

Add a listener so the cart page updates if another tab/component changes the cart while it's open:

```ts
  useEffect(() => {
    const onCartUpdated = () => setItems(normalizeItems(readCart()));
    window.addEventListener('cart-updated', onCartUpdated);
    return () => window.removeEventListener('cart-updated', onCartUpdated);
  }, []);
```

- [ ] **Step 3: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Navigate to a real `/shop/[productId]` page, click "Add to Cart," confirm redirect/toast behavior is unchanged, then open `/cart` and confirm the item appears with correct name/price/size/mockup image. Confirm `localStorage.getItem('aiMerchCart')` in devtools console shows the new item.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/shop/[productId]/page.tsx apps/frontend/src/app/cart/page.tsx
git commit -m "refactor: migrate shop and cart pages onto shared cart module"
```

### Task 3: Migrate `/studio/compose` off `CartContext`

**Files:**
- Modify: `apps/frontend/src/app/studio/compose/page.tsx:1-69`

**Interfaces:**
- Consumes: `addToCart` from `@/lib/cart` (Task 1).

- [ ] **Step 1: Replace the CartContext usage**

Remove `import { useCart } from '@/context/CartContext';` and the `const { addItem } = useCart();` line. Add `import { addToCart } from '@/lib/cart';`.

Replace `handleSave`'s body (the `addItem({ ...product, mockupImageUrl: imageUrl }, 1, assetId)` call, currently line 63) with:

```ts
      addToCart({
        productId: product.id,
        productName: product.name,
        price: product.price ?? product.base_price ?? 0,
        assetId: assetId ?? undefined,
        assetTitle: asset?.title,
        mockupImageUrl: imageUrl,
        size: null,
      });
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Go through `/studio/gallery` → pick a design → `/studio/apply` → pick "Test t-shirt" (the one existing product doc) → `/studio/compose` → drag/resize the design → "Save & Add to Cart." Confirm it redirects to `/cart` and the item is actually visible there (this is the exact bug being fixed — confirm it wasn't visible before this task and is after).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/studio/compose/page.tsx
git commit -m "fix: studio compose flow now writes to the cart checkout actually reads"
```

### Task 4: Migrate Header/CartSheet badge count, retire CartContext

**Files:**
- Modify: `apps/frontend/src/components/layout/Header.tsx`
- Modify: `apps/frontend/src/components/cart/CartSheet.tsx`
- Modify: `apps/frontend/src/app/layout.tsx` (remove `<CartProvider>`)
- Delete: `apps/frontend/src/context/CartContext.tsx`

**Interfaces:**
- Consumes: `getCartCount`, `readCart` from `@/lib/cart` (Task 1).
- Produces: none (leaf consumers).

- [ ] **Step 1: Read the current Header and CartSheet implementations**

Run: `grep -n "useCart\|cartCount\|CartContext" apps/frontend/src/components/layout/Header.tsx apps/frontend/src/components/cart/CartSheet.tsx`

This surfaces exactly which JSX/state reads `useCart()` in each file — the next step's edits depend on what's found (both currently import `useCart` per the earlier grep in this plan's research phase, but exact line numbers weren't captured).

- [ ] **Step 2: Replace `useCart()` in both files with a local hook**

Add to `apps/frontend/src/lib/cart.ts` (append to the file from Task 1):

```ts
import { useEffect, useState } from 'react';

export function useCartCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(getCartCount());
    const update = () => setCount(getCartCount());
    window.addEventListener('cart-updated', update);
    return () => window.removeEventListener('cart-updated', update);
  }, []);

  return count;
}
```

In `Header.tsx` and `CartSheet.tsx`, replace `const { cartCount } = useCart();` (or equivalent) with `const cartCount = useCartCount();` and update the import from `@/context/CartContext` to `@/lib/cart`. If `CartSheet.tsx` also reads `items` for rendering line items, replace that with `readCart()` inside a `useEffect` the same way Task 2 did for `/cart/page.tsx`.

- [ ] **Step 3: Remove `CartProvider` and delete `CartContext.tsx`**

In `apps/frontend/src/app/layout.tsx`, remove the `<CartProvider>` import and JSX wrapper.

Run: `rm apps/frontend/src/context/CartContext.tsx`

- [ ] **Step 4: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0 — this will fail loudly if any other file still imports the deleted `CartContext`, which is the point (confirms nothing was missed).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Confirm the header cart badge shows the correct count on page load, after adding an item from `/shop`, and after adding an item from `/studio/compose`, without a page refresh.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/layout/Header.tsx apps/frontend/src/components/cart/CartSheet.tsx apps/frontend/src/app/layout.tsx
git rm apps/frontend/src/context/CartContext.tsx
git commit -m "refactor: retire CartContext, header/cart-sheet read shared cart module"
```

---

## Phase 2: Fix Known Path-A Bugs

**Why:** Found and confirmed live 2026-07-03, independent of Phase 1 — can run in parallel or before it.

### Task 1: Fix Refresh Mockup / Backfill button gating

**Files:**
- Modify: `apps/frontend/src/app/admin/assets/page.tsx:197`, `:288`

- [ ] **Step 1: Fix the per-row button condition**

Change line 288 from:
```ts
{asset.printifyProductId && !asset.mockupUrl && (
```
to:
```ts
{asset.printifyProductId && !asset.mockupImages?.length && (
```

- [ ] **Step 2: Fix the bulk backfill button condition**

Change line 197's filter from:
```ts
disabled={backfilling || assets.filter((a) => a.printifyProductId && !a.mockupUrl).length === 0}
```
to:
```ts
disabled={backfilling || assets.filter((a) => a.printifyProductId && !a.mockupImages?.length).length === 0}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/admin/assets`. Confirm "Backfill All Mockups" is now enabled (since all 8 published assets have `mockupUrl` but only 1 has `mockupImages`), and confirm a "Refresh Mockup" button now appears on the 7 published rows that were previously hidden. Click it on one and confirm `mockupImages` gets written (re-use the same Firestore spot-check pattern from this session's earlier verification — read the doc via `ops/firebase-admin/` and confirm `mockupImages.length === 1`, matching the "1 image per single-color product" constraint).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/admin/assets/page.tsx
git commit -m "fix: refresh-mockup button now gates on mockupImages, not legacy mockupUrl"
```

### Task 2: Fix blank category label fallback

**Files:**
- Modify: `apps/frontend/src/app/shop/[productId]/page.tsx:40-49`

- [ ] **Step 1: Fix the fallback**

Change:
```ts
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
```
to:
```ts
function categoryLabel(raw: string): string {
  const map: Record<string, string> = {
    shirt: 'Shirt',
    hoodie: 'Hoodie',
    tote: 'Tote Bag',
    mug: 'Mug',
    cup: 'Cup',
  };
  if (!raw) return 'Product';
  return map[raw.toLowerCase()] ?? raw;
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, revisit a published `/shop/[productId]` page with no `product_category` set — confirm the category badge now reads "Product" instead of rendering blank. Re-run the `designGroupId` sibling-switcher test from this session (link two real assets' `designGroupId` temporarily, confirm the "Also available as" pill now shows "Product" instead of blank text, then clear the test value back to `null`).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/shop/[productId]/page.tsx
git commit -m "fix: categoryLabel falls back to 'Product' instead of blank string"
```

---

## Phase 3 & 4: Roadmap (not yet bite-sized — needs a follow-up scoping pass)

These are scoped at a coarser grain deliberately, to avoid writing detailed steps against files not yet fully read (`save-mockup/route.ts` hasn't been reviewed this session) or against product-template content that doesn't exist yet. Expand each into full Task/Step detail (same format as Phases 1-2) in a follow-up planning pass once Phase 1-2 have shipped and there's a checkpoint to decide if this is still the priority.

**Phase 3 — Give the Studio flow real product templates**
1. Collapse `Product`'s four synonymous image fields (`mockupImageUrl`, `mockup_image_url`, `imageUrl`, `mockup_base_image` in `src/lib/types.ts:1-18`) to one canonical field before adding more real data on top of the messy schema — grep every consumer first (`admin/products/page.tsx`, `admin/products/new/page.tsx`, `admin/products/[productId]/page.tsx`, `studio/apply/page.tsx`, `studio/compose/page.tsx`) and update each.
2. Fix `admin/products/page.tsx`'s dead "View in shop" link (`/shop/${p.id}` 404s today since `/shop/[productId]` only queries `assets`) — either remove the link or repoint it at `/studio/apply?assetId=<defaultAssetId>`.
3. Content task (not code): create 5 real `Product` docs (shirt/hoodie/tote/mug/cup) via `/admin/products/new`, each with a real flat-lay/front-shot base mockup image uploaded to Firebase Storage first. This unblocks `/studio/apply` from only offering the one placeholder "Test t-shirt."

**Phase 4 — Get Studio-composed orders to the same manual-fulfillment bar as `/shop`**
1. Read `apps/frontend/src/app/api/save-mockup/route.ts` in full (not reviewed this session) to establish its actual current behavior before changing it.
2. Decide and implement how a composed order carries what a human needs to manually place the real Printify order later: at minimum, the *original* high-res `asset.imageUrl` (not just the flattened Konva preview PNG) plus the chosen product's `product_category`, plus the Konva placement (x/y/scale relative to stage) so the manual fulfiller can approximate positioning on Printify's own product editor. This does NOT require calling `createPrintifyProduct`/`uploadImageToPrintify` at checkout time — Global Constraints confirm fulfillment is manual for `/shop` orders today too, so Phase 4 only needs to match that bar, not exceed it.
3. Extend `FlatCartItem` (and therefore the `orders` doc it flows into via `checkout_sessions`) with the additional fields from step 2, and confirm `create-checkout-session`'s `CheckoutItemPayload` passes them through into `session.metadata` or the `checkout_sessions` Firestore doc so they survive into the `orders` collection the human fulfiller actually looks at.

---

## Self-Review

**Spec coverage:** Cart-key mismatch (Phase 1, all 4 tasks) covered. Refresh Mockup / Backfill gating bug (Phase 2 Task 1) covered. Blank categoryLabel bug (Phase 2 Task 2) covered. Product schema/admin dead-link cleanup and real template population (Phase 3, scoped) covered. Composed-order fulfillment parity (Phase 4, scoped) covered. Cost-consciousness (manual verification only, no new test framework, phased so Phase 3/4 detail is deferred until there's a checkpoint) covered.

**Placeholder scan:** Phases 1-2 contain complete code for every step, exact file paths and line numbers, exact commands. Phase 3/4 are explicitly labeled "roadmap, not yet bite-sized" rather than disguised as complete tasks — this is a deliberate scope boundary, not a placeholder, since expanding them now would mean writing plausible-looking code against a file (`save-mockup/route.ts`) I haven't actually read, which would be worse than being upfront about the gap.

**Type consistency:** `FlatCartItem` defined once in Task 1 of Phase 1, reused verbatim (`readCart`/`writeCart`/`addToCart`/`removeFromCart`/`getCartCount`/`useCartCount`) by every later task in Phase 1 — no renamed functions across tasks.
