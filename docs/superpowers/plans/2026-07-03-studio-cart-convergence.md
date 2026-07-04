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

## Phase 3: Real Product Templates (done — historical record)

**Status: shipped 2026-07-03/04, commits `03f0808`, `e71a5fa`, plus the CORS/data fixes below.** Implemented differently than originally roadmapped here (kept as historical record, not corrected in place): instead of an admin-UI content task, 5 real base templates (shirt/hoodie/tote/mug/cup) were generated via a new script `ops/firebase-admin/generate-product-templates.mjs` (Recraft V3, `realistic_image` style, flat front shot — Printify's own catalog images were checked and rejected as on-model lifestyle photos, not compositing-ready). `Product`'s image fields were collapsed to one `mockupImageUrl` across `types.ts`, `admin/products/page.tsx`, `studio/apply/page.tsx`, `studio/compose/page.tsx`. The dead "View in shop" link was repointed to `/studio/apply?assetId=<defaultAssetId>`. Two bugs outside original scope were found and fixed along the way: the Storage bucket had no CORS policy (broke every Konva `crossOrigin` image load, not just new templates) and a third orphaned prototype commerce flow (`src/app/studio/page.tsx`) was discovered and removed. See `[[project_studio_cart_convergence]]` memory for full detail.

---

## Phase 4: Fulfillment Parity for Studio-Composed Orders

**Why now:** Phase 1-3 make Studio-composed items reach checkout and use real product art. But once paid, a Studio order's `orders.items[]` entry only carries a flattened preview PNG (`mockupImageUrl`) — a human fulfiller has no way to know which part of the original artwork was used, where it was placed, or what product category to hand-build in Printify's own editor. `/shop` orders don't have this problem because their `mockupImageUrl` already *is* a real Printify product photo built ahead of time. Fulfillment stays 100% manual either way (confirmed in `stripe-webhook/route.ts:78-82` — `fulfillment.status: 'unfulfilled'`, a human updates it later) — Phase 4 only has to get the *data* to that human, not automate Printify order creation.

**Data path (confirmed by reading every file in it this session):** `studio/compose/page.tsx`'s `handleSave` → `addToCart()` writes a `FlatCartItem` to `localStorage['aiMerchCart']` (`src/lib/cart.ts`) → `cart/page.tsx`'s `handleCheckout` builds a payload and POSTs it to `/api/create-checkout-session` → that route's `normalizedItems` are written verbatim into `checkout_sessions/{checkoutId}.items` → `stripe-webhook/route.ts`'s `upsertOrderFromCheckoutSession` copies `checkout.items` **unmodified** into `orders/{checkoutId}.items` (confirmed: `const items = (checkout?.items ?? []) as unknown[];` then `items` is placed directly on `orderPayload`, no per-field remapping). So any field added to `FlatCartItem` only needs to survive two hand-offs (`cart/page.tsx`'s checkout payload, and `create-checkout-session`'s `normalizedItems`) to land in the human-facing `orders` doc — no webhook changes needed.

**Bug found in the same code path (folded into Task 4, not a separate phase):** `cart/page.tsx`'s `handleCheckout` payload today only forwards `id, assetId, productId, assetTitle, productName, quantity, size` — it drops `price` and `mockupImageUrl` entirely. That means **every** order today (Studio or `/shop`) reaches Stripe/`orders` with no line-item image and a price that silently falls back to `$0.50` server-side (`create-checkout-session`'s `unitPrice` fallback chain ends in `?? 0`, then `Math.max(50, ...)` cents). This has to be fixed in the same edit as Task 4 below, or the new Phase 4 fields would be dropped by the identical bug.

- [ ] **Step 0: Confirm the pre-existing price/image drop live before changing anything**

Run: `cd apps/frontend && npm run dev`, add any item to the cart from `/shop`, open `/cart`, click "Proceed to checkout," then check the terminal running `npm run dev` for the `checkout_session.created` log line, or inspect `checkout_sessions/{checkoutId}` in the Firebase console.
Expected: `items[0].unitAmountCents` is `50` (the floor) regardless of the product's real price, and `items[0].mockupImageUrl` is `null`. This confirms the bug described above before Task 4 fixes it.

### Task 1: Add `DesignPlacement` type and new fields to `FlatCartItem`

**Files:**
- Modify: `apps/frontend/src/lib/cart.ts:1-15`

**Interfaces:**
- Produces: `DesignPlacement` type (`{ x: number; y: number; scaleX: number; scaleY: number }`, all normalized 0-1 / unitless relative to stage size so they're resolution-independent), and three new optional `FlatCartItem` fields: `designImageUrl`, `productCategory`, `placement`. Every later task in this phase reads/writes these exact names.

- [ ] **Step 1: Add the type and fields**

In `apps/frontend/src/lib/cart.ts`, replace:

```ts
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
```

with:

```ts
export type DesignPlacement = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

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
  /** Original high-res design image (not the flattened Konva preview) — for manual fulfillment. */
  designImageUrl?: string | null;
  productCategory?: string | null;
  placement?: DesignPlacement | null;
};
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0 (new fields are optional, so no existing caller breaks).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/cart.ts
git commit -m "feat: add designImageUrl/productCategory/placement to FlatCartItem"
```

### Task 2: Tag the draggable design node so its transform can be read from outside Konva

**Files:**
- Modify: `apps/frontend/src/components/studio/KonvaComposer.tsx:70-83`

**Interfaces:**
- Produces: a Konva node addressable via `stage.findOne('.design-asset')`, exposing `.x()`, `.y()`, `.scaleX()`, `.scaleY()` — Task 3 reads these through the existing `stageRef` without any new prop or ref plumbing.

- [ ] **Step 1: Add a `name` to the draggable image**

In `apps/frontend/src/components/studio/KonvaComposer.tsx`, inside `DraggableAsset`'s success-path return, change:

```tsx
      <KonvaImage
        ref={imageRef}
        image={image}
        x={pos}
        y={pos}
        width={size}
        height={size}
        draggable
      />
```

to:

```tsx
      <KonvaImage
        ref={imageRef}
        name="design-asset"
        image={image}
        x={pos}
        y={pos}
        width={size}
        height={size}
        draggable
      />
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `/studio/compose?assetId=<id>&productId=<id>` for any real asset/product pair, open the browser devtools console, and run:
```js
document.querySelector('canvas') && true
```
(just confirms the canvas mounted — the `name` attribute itself isn't independently visible in devtools; it's verified functionally in Task 3's manual check instead, since that's the first place it's actually read.)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/studio/KonvaComposer.tsx
git commit -m "feat: tag draggable design node for placement capture on save"
```

### Task 3: Capture placement + original design image + category on save

**Files:**
- Modify: `apps/frontend/src/app/studio/compose/page.tsx:49-81`

**Interfaces:**
- Consumes: `DesignPlacement` type from `@/lib/cart` (Task 1); `.design-asset`-named node from `stageRef.current.findOne(...)` (Task 2); `asset.imageUrl` and `product.product_category` (already loaded, `src/lib/types.ts`).
- Produces: the three new fields passed into `addToCart()`, consumed by Task 4's checkout payload builder.

- [ ] **Step 1: Compute placement and pass the new fields in `handleSave`**

In `apps/frontend/src/app/studio/compose/page.tsx`, replace the body of `handleSave` from:

```ts
  const handleSave = async () => {
    if (!stageRef.current || !asset || !product || !assetId || !productId) return;
    setSaving(true);
    setError(null);
    try {
      const transformers = stageRef.current.find('Transformer');
      transformers.forEach((tr) => tr.hide());
      stageRef.current.batchDraw();
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
      transformers.forEach((tr) => tr.show());
      stageRef.current.batchDraw();
      const res = await fetch('/api/save-mockup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, assetId, productId }),
      });
      if (!res.ok) throw new Error('Save failed');
      const { imageUrl } = await res.json();
      addToCart({
        productId: product.id,
        productName: product.name,
        price: product.price ?? product.base_price ?? 0,
        assetId: assetId ?? undefined,
        assetTitle: asset?.title,
        mockupImageUrl: imageUrl,
        size: null,
      });
      router.push('/cart');
    } catch {
      setError('Could not save your design. Please try again.');
      setSaving(false);
    }
  };
```

to:

```ts
  const handleSave = async () => {
    if (!stageRef.current || !asset || !product || !assetId || !productId) return;
    setSaving(true);
    setError(null);
    try {
      const stage = stageRef.current;
      const designNode = stage.findOne<Konva.Image>('.design-asset');
      const placement: DesignPlacement | null = designNode
        ? {
            x: designNode.x() / stage.width(),
            y: designNode.y() / stage.height(),
            scaleX: designNode.scaleX(),
            scaleY: designNode.scaleY(),
          }
        : null;

      const transformers = stage.find('Transformer');
      transformers.forEach((tr) => tr.hide());
      stage.batchDraw();
      const dataUrl = stage.toDataURL({ pixelRatio: 2 });
      transformers.forEach((tr) => tr.show());
      stage.batchDraw();
      const res = await fetch('/api/save-mockup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, assetId, productId }),
      });
      if (!res.ok) throw new Error('Save failed');
      const { imageUrl } = await res.json();
      addToCart({
        productId: product.id,
        productName: product.name,
        price: product.price ?? product.base_price ?? 0,
        assetId: assetId ?? undefined,
        assetTitle: asset?.title,
        mockupImageUrl: imageUrl,
        designImageUrl: asset.imageUrl,
        productCategory: product.product_category ?? null,
        placement,
        size: null,
      });
      router.push('/cart');
    } catch {
      setError('Could not save your design. Please try again.');
      setSaving(false);
    }
  };
```

Add `DesignPlacement` to the existing `@/lib/cart` import at the top of the file:

```ts
import { addToCart, type DesignPlacement } from '@/lib/cart';
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Go through `/studio/gallery` → pick a design → `/studio/apply` → pick a real product → `/studio/compose`. Drag the design well away from center and resize it noticeably smaller using the transformer handles, then click "Save & Add to Cart." In the browser devtools console before clicking Save, run `localStorage.getItem('aiMerchCart')` after landing on `/cart` and confirm the new item's JSON includes `designImageUrl` (a real image URL, different from `mockupImageUrl`), `productCategory` (matches the chosen product's category), and a `placement` object whose `x`/`y` are NOT close to `0.3` (the default centered position for the default 40%-sized image at `pos = (600 - 240)/2 = 180`, i.e. `180/600 = 0.3`) and whose `scaleX`/`scaleY` are NOT `1` — confirming the captured values reflect your actual drag/resize, not just defaults.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/studio/compose/page.tsx
git commit -m "feat: capture design placement and original artwork on compose save"
```

### Task 4: Fix the cart-to-checkout payload gap and forward the new fields

**Files:**
- Modify: `apps/frontend/src/app/cart/page.tsx:58-69`

**Interfaces:**
- Consumes: `price`, `mockupImageUrl`, `designImageUrl`, `productCategory`, `placement` from `FlatCartItem` (Task 1).
- Produces: a checkout POST payload whose per-item shape is consumed by `create-checkout-session`'s `CheckoutItemPayload` (Task 5) — field names must match exactly.

- [ ] **Step 1: Fix and extend the checkout payload**

In `apps/frontend/src/app/cart/page.tsx`, inside `handleCheckout`, replace:

```ts
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
```

with:

```ts
      const payload = {
        userId: 'anon',
        items: items.map((item, index) => ({
          id: `${Date.now()}-${index}`,
          assetId: item.assetId ?? '',
          productId: item.productId,
          assetTitle: item.assetTitle ?? 'Untitled design',
          productName: item.productName ?? 'Product',
          price: item.price,
          mockupImageUrl: item.mockupImageUrl ?? null,
          quantity: item.quantity,
          size: item.size,
          designImageUrl: item.designImageUrl ?? null,
          productCategory: item.productCategory ?? null,
          placement: item.placement ?? null,
        })),
      };
```

(`price` and `mockupImageUrl` were missing before this change — every order, not just Studio ones, was reaching Stripe/`orders` with no line-item image and a price silently floored to $0.50. This fixes that alongside the new Phase 4 fields since it's the same object literal.)

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Add an item from `/shop` (a plain path with a known real price, e.g. $25), go to `/cart`, click "Proceed to checkout," then check `checkout_sessions/{checkoutId}` in the Firebase console (or the `checkout_session.created` server log). Confirm `items[0].unitAmountCents` is now `2500` (not `50`) and `items[0].mockupImageUrl` is a real URL (not `null`) — this confirms Step 0's pre-existing bug is fixed for the `/shop` path too.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/cart/page.tsx
git commit -m "fix: cart checkout payload now forwards price/mockupImageUrl and Phase 4 fulfillment fields"
```

### Task 5: Extend `create-checkout-session`'s item shape to persist the new fields

**Files:**
- Modify: `apps/frontend/src/app/api/create-checkout-session/route.ts:8-24`, `:60-94`

**Interfaces:**
- Consumes: `designImageUrl`, `productCategory`, `placement` from the checkout POST body (Task 4).
- Produces: the same three fields on `checkout_sessions/{checkoutId}.items[]`, which `stripe-webhook/route.ts` copies verbatim into `orders/{checkoutId}.items[]` — no webhook change needed (confirmed: `const items = (checkout?.items ?? []) as unknown[];` then placed directly on `orderPayload` with no per-field mapping).

- [ ] **Step 1: Extend `CheckoutItemPayload`**

In `apps/frontend/src/app/api/create-checkout-session/route.ts`, replace:

```ts
type CheckoutItemPayload = {
  id: string;
  assetId: string;
  productId: string;
  assetTitle: string;
  productName: string;
  price: number;
  mockupImageUrl?: string | null;
  quantity: number;
  size?: string;

  // optional legacy fields we might still see:
  product?: any;
  mockup_image_url?: string;
  imageUrl?: string;
  mockup_base_image?: string;
};
```

with:

```ts
type DesignPlacement = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

type CheckoutItemPayload = {
  id: string;
  assetId: string;
  productId: string;
  assetTitle: string;
  productName: string;
  price: number;
  mockupImageUrl?: string | null;
  quantity: number;
  size?: string;
  designImageUrl?: string | null;
  productCategory?: string | null;
  placement?: DesignPlacement | null;

  // optional legacy fields we might still see:
  product?: any;
  mockup_image_url?: string;
  imageUrl?: string;
  mockup_base_image?: string;
};
```

- [ ] **Step 2: Carry the fields into `normalizedItems`**

Replace the `normalizedItems` return object:

```ts
      return {
        cartItemId: item.id ?? '',
        assetId: item.assetId ?? '',
        assetTitle: item.assetTitle ?? '',
        productId: item.productId ?? '',
        productName: item.productName ?? item.product?.name ?? 'Product',
        quantity,
        unitAmountCents: unit_amount,
        mockupImageUrl: imageUrl,
        size: item.size ?? null,
      };
```

with:

```ts
      return {
        cartItemId: item.id ?? '',
        assetId: item.assetId ?? '',
        assetTitle: item.assetTitle ?? '',
        productId: item.productId ?? '',
        productName: item.productName ?? item.product?.name ?? 'Product',
        quantity,
        unitAmountCents: unit_amount,
        mockupImageUrl: imageUrl,
        size: item.size ?? null,
        designImageUrl: item.designImageUrl ?? null,
        productCategory: item.productCategory ?? null,
        placement: item.placement ?? null,
      };
```

- [ ] **Step 3: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/api/create-checkout-session/route.ts
git commit -m "feat: persist Phase 4 fulfillment fields into checkout_sessions and orders"
```

### Task 6: Full pipeline manual verification (no code changes)

**Files:** none — verification only.

- [ ] **Step 1: Verify the full Studio → order pipeline carries all three new fields**

Run: `npm run dev`. Go through `/studio/gallery` → pick a design → `/studio/apply` → pick a real product → `/studio/compose`. Drag the design off-center and resize it, then "Save & Add to Cart," then from `/cart` click "Proceed to checkout." Before completing the Stripe payment (or after, in test mode — either works since `checkout_sessions` is written before Stripe session creation), inspect `checkout_sessions/{checkoutId}` in the Firebase console and confirm `items[0]` has:
- `designImageUrl` — a real image URL, different from `mockupImageUrl`
- `productCategory` — matches the chosen product's category
- `placement.x`, `placement.y`, `placement.scaleX`, `placement.scaleY` — non-default values reflecting the actual drag/resize

If you complete the test payment, also confirm `orders/{checkoutId}.items[0]` has the identical three fields (expected automatically, since the webhook copies `items` verbatim — this just confirms that assumption holds in practice).

- [ ] **Step 2: No commit** — this task only confirms Tasks 1-5 work together; nothing new to commit.

---

## Phase 5: Server-Side Price Validation

**Why:** Phase 4's final whole-branch review flagged that `create-checkout-session/route.ts` computes `unitPrice` from the client-supplied `item.price` (originating in `localStorage['aiMerchCart']`), with no server-side check against the real product price. A user who edits their own `localStorage` can set `price: 0.01` and pay 1 cent for any product — Stripe charges whatever the client claims. This is pre-existing (not introduced by Phase 4) and Phase 4's price/mockupImageUrl fix already made it strictly better (before, every order was floored to $0.50 regardless of price; now honest customers are charged correctly and only a tampering user underpays) — but it should still be closed.

**Fix:** Look up each line item's real price server-side from its `products/{productId}` Firestore doc instead of trusting `item.price`. Fail closed: if a `productId` doesn't resolve to a real product doc, reject the whole checkout with 400 rather than falling back to any client-supplied number.

**Canonical price source (confirmed by reading every price-setting call site this session):** `Product.price` (`src/lib/types.ts`) is set via `/admin/products/new` and `/admin/products/[productId]`'s edit form (both write a parsed `priceInput` to Firestore `products/{id}.price`). `/shop/[productId]/page.tsx:92` reads it with a `?? 25` fallback for products missing the field. This task uses the identical `?? 25` fallback so pricing behavior for existing products doesn't change — only the *source* of truth changes, from client to server.

### Task 1: Fetch real product prices server-side and stop trusting `item.price`

**Files:**
- Modify: `apps/frontend/src/app/api/create-checkout-session/route.ts:68-107`

**Interfaces:**
- Consumes: `adminDb` (already imported), `products/{productId}` Firestore docs (`price: number` field).
- Produces: same `normalizedItems` shape as before (no field names change) — only `unitAmountCents`'s source changes. Returns a 400 response (instead of proceeding) when any `productId` in the cart doesn't resolve to a real product doc.

- [x] **Step 1: Replace the synchronous `normalizedItems` map with an async price-validated version**

Replace:

```ts
    let subtotalCents = 0;

    const normalizedItems = items.map((item) => {
      // image fallback: new flat fields first, then any legacy product object
      const imageUrl =
        item.mockupImageUrl ??
        item.mockup_image_url ??
        item.imageUrl ??
        item.mockup_base_image ??
        item.product?.mockupImageUrl ??
        item.product?.mockup_image_url ??
        item.product?.imageUrl ??
        item.product?.mockup_base_image ??
        null;

      // prefer flat price from cart; fall back to old product.price/base_price
      const unitPrice =
        typeof item.price === 'number' && !Number.isNaN(item.price)
          ? item.price
          : (item.product?.price ?? item.product?.base_price ?? 0);

      const unit_amount = Math.max(50, Math.round((unitPrice || 0) * 100)); // at least $0.50
      const quantity = item.quantity || 1;
      subtotalCents += unit_amount * quantity;

      return {
        cartItemId: item.id ?? '',
        assetId: item.assetId ?? '',
        assetTitle: item.assetTitle ?? '',
        productId: item.productId ?? '',
        productName: item.productName ?? item.product?.name ?? 'Product',
        quantity,
        unitAmountCents: unit_amount,
        mockupImageUrl: imageUrl,
        size: item.size ?? null,
        designImageUrl: item.designImageUrl ?? null,
        productCategory: item.productCategory ?? null,
        placement: item.placement ?? null,
      };
    });
```

with:

```ts
    // Look up each unique product's real price server-side — never trust
    // the client-supplied item.price for the amount actually charged.
    const uniqueProductIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
    const productPriceById = new Map<string, number>();

    const productSnaps = await Promise.all(
      uniqueProductIds.map((id) => adminDb.collection('products').doc(id).get()),
    );

    const missingProductIds: string[] = [];
    productSnaps.forEach((snap, i) => {
      const id = uniqueProductIds[i];
      if (!snap.exists) {
        missingProductIds.push(id);
        return;
      }
      const data = snap.data();
      const price = typeof data?.price === 'number' ? data.price : 25; // matches /shop's fallback
      productPriceById.set(id, price);
    });

    if (missingProductIds.length > 0) {
      return NextResponse.json(
        { error: `Unknown product(s) in cart: ${missingProductIds.join(', ')}` },
        { status: 400 },
      );
    }

    let subtotalCents = 0;

    const normalizedItems = items.map((item) => {
      // image fallback: new flat fields first, then any legacy product object
      const imageUrl =
        item.mockupImageUrl ??
        item.mockup_image_url ??
        item.imageUrl ??
        item.mockup_base_image ??
        item.product?.mockupImageUrl ??
        item.product?.mockup_image_url ??
        item.product?.imageUrl ??
        item.product?.mockup_base_image ??
        null;

      // Server-verified price only — item.price is no longer trusted for the charge amount.
      const unitPrice = productPriceById.get(item.productId ?? '') ?? 25;

      const unit_amount = Math.max(50, Math.round(unitPrice * 100)); // at least $0.50
      const quantity = item.quantity || 1;
      subtotalCents += unit_amount * quantity;

      return {
        cartItemId: item.id ?? '',
        assetId: item.assetId ?? '',
        assetTitle: item.assetTitle ?? '',
        productId: item.productId ?? '',
        productName: item.productName ?? item.product?.name ?? 'Product',
        quantity,
        unitAmountCents: unit_amount,
        mockupImageUrl: imageUrl,
        size: item.size ?? null,
        designImageUrl: item.designImageUrl ?? null,
        productCategory: item.productCategory ?? null,
        placement: item.placement ?? null,
      };
    });
```

(`uniqueProductIds`/`productPriceById`/the 400-on-missing-product check must be inserted *before* the existing `if (!items.length)` early-return block's position in the function — i.e., right after that guard, before `let subtotalCents = 0;` — since it needs `items` already validated non-empty. Insert the whole new block where the old `let subtotalCents = 0;` line began.)

- [x] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: exit 0.

- [x] **Step 3: Manual verification**

Run: `npm run dev`. Add a real item from `/shop` to the cart, then in the browser devtools console run:
```js
const cart = JSON.parse(localStorage.getItem('aiMerchCart'));
cart[0].price = 0.01;
localStorage.setItem('aiMerchCart', JSON.stringify(cart));
```
Reload `/cart` and click "Proceed to checkout." Confirm the checkout still succeeds (product exists) but check `checkout_sessions/{checkoutId}.items[0].unitAmountCents` in the Firebase console — it must be the product's real price in cents (e.g. `2500`), NOT `1` — confirming the tampered client price was ignored.

Separately, confirm the fail-closed path: in devtools, set `cart[0].productId = 'does-not-exist'` and repeat. Confirm `/api/create-checkout-session` returns a 400 with an "Unknown product(s)" error rather than creating a Stripe session.

- [x] **Step 4: Commit**

```bash
git add apps/frontend/src/app/api/create-checkout-session/route.ts
git commit -m "fix: validate checkout item prices server-side against products collection"
```

---

## Self-Review

**Spec coverage:** Cart-key mismatch (Phase 1, all 4 tasks) covered. Refresh Mockup / Backfill gating bug (Phase 2 Task 1) covered. Blank categoryLabel bug (Phase 2 Task 2) covered. Product schema/admin dead-link cleanup and real template population (Phase 3, done — historical record). Composed-order fulfillment parity (Phase 4): original high-res design image (Task 3, `designImageUrl`), product category (Task 3, `productCategory`), and Konva placement (Task 2 + 3, `placement`) all covered end-to-end through `FlatCartItem` → checkout payload → `checkout_sessions`/`orders` (Tasks 1, 4, 5), with the pre-existing price/mockupImageUrl drop in `cart/page.tsx` fixed in the same task since it sits on the identical object literal. No automated Printify order submission added, matching the manual-fulfillment constraint. Cost-consciousness (manual verification only, no new test framework, no Stripe test payment required to verify the data plumbing since `checkout_sessions` is written before the Stripe session) covered.

**Placeholder scan:** Phase 4 contains complete code for every step (no "TBD"/"similar to Task N"/described-not-shown steps) — every Task has exact file paths, exact before/after code blocks, and exact verification commands. Phase 3 is left as a historical-record paragraph (not disguised as a bite-sized task) since it already shipped via a different, already-committed implementation — re-writing it as fake bite-sized steps would misrepresent completed work as pending.

**Type consistency:** `DesignPlacement` defined once in Task 1 (`src/lib/cart.ts`) and reused with identical field names (`x`/`y`/`scaleX`/`scaleY`) in Task 3 (`studio/compose/page.tsx`) and re-declared with the same shape in Task 5 (`create-checkout-session/route.ts`, a separate server-side file that doesn't import client code) — no renamed fields across tasks. `designImageUrl`/`productCategory`/`placement` names are identical across `FlatCartItem` (Task 1), `addToCart()` call (Task 3), the checkout payload (Task 4), and `CheckoutItemPayload`/`normalizedItems` (Task 5) — no relabeling at any hand-off.
