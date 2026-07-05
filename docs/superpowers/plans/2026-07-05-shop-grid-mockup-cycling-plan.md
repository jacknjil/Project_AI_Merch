# Shop Grid Mockup Cycling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/shop` grid tiles reveal a product's multiple Printify mockup images — cycling automatically on desktop hover, advancing on tap on touch devices — instead of showing one static image per tile.

**Architecture:** A new client component, `ProductTileImage`, owns all image-cycling state (active index, hover interval, cleanup) and renders either the existing single-image/placeholder behavior (when a product has 0–1 mockup images) or a cycling image with a dot-row indicator (when it has 2+). `shop/page.tsx` is updated to fetch the already-existing `mockupImages` field from Firestore and delegate rendering to the new component instead of its current inline `<Image>` block.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, `next/image`. No new dependencies. Inline `style` objects matching this file's existing dark-theme convention (no Tailwind classes used in `shop/page.tsx` today).

## Global Constraints

- Zero visual/behavioral change for any product with 0 or 1 mockup images — must render exactly as today (verbatim placeholder/image markup).
- No new npm dependencies, no test framework added — verification is `npx tsc --noEmit` plus manual Playwright checks against the dev server, per explicit user decision (see spec's "Testing" section and session discussion on 2026-07-05).
- Desktop hover: 1500ms interval, loops indefinitely while hovered, resets to index 0 on mouse-leave.
- Touch/click: advances one image per click, does not trigger navigation (the tile image has no existing click-to-navigate behavior — only the separate "View details" link navigates).
- Dot row renders only when there are 2+ mockup images.

---

### Task 1: Create the `ProductTileImage` component

**Files:**
- Create: `apps/frontend/src/components/shop/ProductTileImage.tsx`

**Interfaces:**
- Produces: `export type MockupImage = { src: string; label: string; isDefault: boolean }` and `export default function ProductTileImage({ mockupImages, fallbackSrc, alt }: { mockupImages?: MockupImage[]; fallbackSrc: string | null; alt: string })` — a client component rendering a `<div>` wrapping either an `<Image>`/placeholder plus optional dot row.

- [ ] **Step 1: Create the component file**

```tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

export type MockupImage = { src: string; label: string; isDefault: boolean };

interface ProductTileImageProps {
  mockupImages?: MockupImage[];
  fallbackSrc: string | null;
  alt: string;
}

const CYCLE_INTERVAL_MS = 1500;

export default function ProductTileImage({ mockupImages, fallbackSrc, alt }: ProductTileImageProps) {
  const images = mockupImages && mockupImages.length > 1 ? mockupImages : null;
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function handleMouseEnter() {
    if (!images) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, CYCLE_INTERVAL_MS);
  }

  function handleMouseLeave() {
    if (!images) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setActiveIndex(0);
  }

  function handleClick() {
    if (!images) return;
    setActiveIndex((prev) => (prev + 1) % images.length);
  }

  const displayedSrc = images ? images[activeIndex].src : fallbackSrc;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{
        borderRadius: 10,
        border: '1px solid #111827',
        overflow: 'hidden',
        background: '#020617',
        aspectRatio: '1 / 1',
        position: 'relative',
        cursor: images ? 'pointer' : 'default',
      }}
    >
      {displayedSrc ? (
        <Image
          src={displayedSrc}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          style={{ objectFit: 'cover' }}
        />
      ) : (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8rem',
            color: '#6b7280',
            textAlign: 'center',
            padding: 8,
          }}
        >
          No image yet
        </span>
      )}

      {images && (
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {images.map((img, i) => (
            <span
              key={img.src}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: i === activeIndex ? '#e5e7eb' : 'rgba(229, 231, 235, 0.35)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

This replicates the current `shop/page.tsx` placeholder/image markup verbatim for the 0–1-image case (same border radius, colors, "No image yet" text) and adds interaction only when `images` is non-null.

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no new errors (this file isn't imported anywhere yet, so it should compile standalone with no errors related to `ProductTileImage.tsx`).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/shop/ProductTileImage.tsx
git commit -m "feat: add ProductTileImage component for mockup cycling"
```

---

### Task 2: Wire `ProductTileImage` into the `/shop` grid

**Files:**
- Modify: `apps/frontend/src/app/shop/page.tsx:11-21` (the `ProductDoc` type)
- Modify: `apps/frontend/src/app/shop/page.tsx:64-80` (the Firestore doc mapping)
- Modify: `apps/frontend/src/app/shop/page.tsx:236-260` (the grid card's image block)

**Interfaces:**
- Consumes: `MockupImage` type and `ProductTileImage` default export from Task 1 (`apps/frontend/src/components/shop/ProductTileImage.tsx`).

- [ ] **Step 1: Add the import**

At the top of `apps/frontend/src/app/shop/page.tsx`, alongside the existing `FilterBar` import:

```tsx
import ProductTileImage, { MockupImage } from '@/components/shop/ProductTileImage';
```

- [ ] **Step 2: Add `mockupImages` to the `ProductDoc` type**

Change:

```tsx
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
```

to:

```tsx
type ProductDoc = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  mockupImageUrl?: string | null;
  mockupImages?: MockupImage[];
  niche?: string;
  style?: string;
  product_category?: string;
  printifyProductId?: string;
};
```

- [ ] **Step 3: Read `mockupImages` in the Firestore mapping**

Change:

```tsx
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
```

to:

```tsx
        const items: ProductDoc[] = snap.docs.map((doc) => {
          const data = doc.data() as any;
          const mockupImageUrl: string | null =
            data.mockupUrl ?? data.imageUrl ?? null;
          const mockupImages: MockupImage[] | undefined = data.mockupImages;

          return {
            id: doc.id,
            name: resolveTitle(data.title, data.niche, data.productCategory ?? data.product_category),
            description: data.description ?? '',
            price: typeof data.price === 'number' ? data.price : 25,
            mockupImageUrl,
            mockupImages,
            niche: data.niche ?? '',
            style: data.style ?? '',
            product_category: data.productCategory ?? data.product_category ?? '',
            printifyProductId: data.printifyProductId ?? '',
          };
        });
```

- [ ] **Step 4: Replace the inline image block with `ProductTileImage`**

Change:

```tsx
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
```

to:

```tsx
                    <ProductTileImage
                      mockupImages={p.mockupImages}
                      fallbackSrc={p.mockupImageUrl}
                      alt={p.name}
                    />
```

Note: the `Image` import from `next/image` at the top of `shop/page.tsx` is still used elsewhere in this file only if referenced — check after this edit whether it's now unused; if `eslint` flags an unused import, remove the `import Image from 'next/image';` line.

- [ ] **Step 5: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `cd apps/frontend && npm run lint`
Expected: no errors (in particular, no unused-import warning for `Image` if it was removed correctly in Step 4).

- [ ] **Step 7: Manual verification against the dev server**

Run: `cd apps/frontend && npm run dev`

Using the Playwright browser tools, verify all of the following against `http://localhost:3000/shop`:

1. **Baseline/fallback case:** find a product tile whose asset has 0 or 1 mockup image (or temporarily note one from Firestore) — confirm it renders identically to before (single static image or "No image yet", no dots).
2. **Hover-cycle:** hover over a tile whose product has 2+ `mockupImages` — confirm the image changes roughly every 1.5s, loops back to the first image after reaching the last, and a dot row is visible at the bottom of the tile with the active dot highlighted.
3. **Mouse-leave reset:** move the mouse away mid-cycle — confirm the tile reverts to the first (default) image and the interval stops (no further changes while un-hovered).
4. **Touch/click-advance:** using Playwright's touch/click emulation (or a mobile viewport), click the tile image directly — confirm it advances to the next image (and wraps around after the last) without navigating away from `/shop`.
5. **Navigation still works:** confirm clicking the separate "View details" link/button still navigates to `/shop/[productId]` as before.
6. Check the browser console for errors during all of the above.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/app/shop/page.tsx
git commit -m "feat: cycle through Printify mockup images on /shop grid tiles"
```

---

## Self-Review Notes

- **Spec coverage:** data flow (Task 2 Step 3), component behavior table — hover/leave/click/unmount (Task 1 Step 1), dot row (Task 1 Step 1 + Task 2 Step 7.2), fallback/no-regression case (Task 1 Step 1 + Task 2 Step 7.1), error handling (no retry logic — matches spec, nothing additional needed since `next/image` already handles a broken `src` the same way for both old and new code paths), testing (Task 2 Step 7, per the user's explicit choice to skip adding a test framework) — all covered.
- **Placeholder scan:** no TBD/TODO; every step has complete code or an exact command.
- **Type consistency:** `MockupImage` defined once in Task 1, imported (not redefined) in Task 2; `ProductTileImageProps` field names (`mockupImages`, `fallbackSrc`, `alt`) match exactly how Task 2 Step 4 calls the component.
