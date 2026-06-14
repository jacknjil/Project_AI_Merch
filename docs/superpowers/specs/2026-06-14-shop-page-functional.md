# Shop Page — Make It Functional
**Date:** 2026-06-14
**Scope:** Pre-Printify shop fixes; items 1–6 only. Sprint 10 (Printify) is out of scope.

---

## Problem

The /shop page loads real Firestore data but is not usable by a real customer:
- A broken link on the homepage sends every featured product to a 404
- Debug internals (product IDs, Firebase URLs) are visible to end users
- There is no path to purchase without going through Studio, which requires an admin-set `defaultAssetId`
- Product category (shirt, mug, hoodie) is never displayed
- The cart has no quantity controls
- Apparel products have no size selector

---

## Out of Scope

- Printify integration (Sprint 10)
- Real product mockup images (Sprint 10)
- Accurate per-variant pricing from Printify (Sprint 10)
- Authentication / saved carts
- Search

---

## Changes

### 1. Fix broken homepage link
**File:** `src/components/home/FeaturedProducts.tsx:53`
Change `href="/products/${p.id}"` → `href="/shop/${p.id}"`.

### 2. Remove debug panels
**Files:**
- `src/app/shop/[productId]/page.tsx` — delete the block that renders Product ID / defaultAssetId / mockupImageUrl
- `src/app/cart/page.tsx` — delete the block that renders productId / assetId as code tags

### 3. Product category display + filter
**ProductDoc type** in shop/page.tsx and [productId]/page.tsx: add `product_category?: string`.
**Shop grid card:** add a small badge below the product name (e.g. "Shirt", "Mug").
**FilterBar:** add a third filter entry for Type derived from loaded products.
**Product detail page:** show category beneath the product name.

### 4. Direct "Add to Cart" on product detail
Add an `addToCart` function that writes a CartItem to localStorage (`aiMerchCart`) without requiring Studio.
For a direct add: `assetId = undefined`, `assetTitle = 'Original design'`, image = product.mockupImageUrl.
Button label: "Add to Cart" — always visible as long as the product is active.
"Customize this design" remains as a secondary CTA when defaultAssetId is set.

### 5. Quantity controls in cart
Add `quantity: number` (default 1) to CartItem.
Each cart line item gets +/− stepper buttons. Min quantity = 1.
Total calculation: sum of item.price * item.quantity.

### 6. Size selector on product detail (apparel only)
Apparel categories: shirt, hoodie, tote.
When product_category is one of these, render size chip buttons: XS / S / M / L / XL / 2XL.
Selected size stored in component state; passed into CartItem as `size?: string`.
Add `size?: string` to CartItem type in cart/page.tsx.
If no size selected on apparel, "Add to Cart" is disabled with label "Select a size".
Non-apparel products (mug, cup) skip the size selector entirely.

---

## Cart Item Shape (after changes)

```ts
type CartItem = {
  productId: string;
  productName: string;
  price?: number;
  assetId?: string;
  assetTitle?: string;
  mockupImageUrl?: string | null;
  quantity: number;       // NEW
  size?: string;          // NEW
};
```

---

## Success Criteria

- [ ] Homepage featured product cards navigate correctly to /shop/[productId]
- [ ] No debug text visible to end users on any page
- [ ] Every active product with a price can be added to cart directly from its detail page
- [ ] Apparel products show a size selector; Add to Cart disabled until size chosen
- [ ] Cart line items show quantity with +/− controls; total updates correctly
- [ ] FilterBar on /shop has Type (product category) as a filter option
- [ ] Product cards and detail page show the product category
