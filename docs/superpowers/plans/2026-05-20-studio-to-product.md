# Studio-to-Product Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three new studio routes (`/studio/gallery`, `/studio/apply`, `/studio/compose`) that let customers browse or generate AI art, drag-and-scale it onto a product mockup via Konva canvas, save the composition, and add it to their cart.

**Architecture:** Linear multi-page flow with URL params carrying state between steps. Each page does one job. KonvaComposer is a client-only component (dynamic import, ssr:false) wrapping react-konva. The `/api/save-mockup` API and CartContext already exist and need no changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, react-konva ^19.2.1, konva ^10.0.12, use-image (to install), Firebase Firestore (client SDK), Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-05-20-studio-to-product-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/types.ts` | Add `Asset` interface |
| Modify | `src/hooks/useProducts.ts` | Export standalone `getProduct(id)` function |
| Create | `src/hooks/useAssets.ts` | `useAssets(count)` hook + standalone `getAsset(id)` |
| Create | `src/app/studio/gallery/page.tsx` | Asset browser — 2-col/3-col grid, "Generate New" CTA |
| Create | `src/app/studio/apply/page.tsx` | Product picker — shows selected asset + product list |
| Create | `src/components/studio/KonvaComposer.tsx` | Konva canvas — product bg + draggable/scalable asset |
| Create | `src/app/studio/compose/page.tsx` | Compose page — wraps KonvaComposer, save + add to cart |
| Modify | `src/app/studio/generate/page.tsx` | Add "Apply to Product →" button on result cards |
| Modify | `src/app/products/[productId]/page.tsx` | Fix "Customize with AI" link target |

All commands run from `apps/frontend/`. Verify with `npm run lint && npm run build` after each task.

---

## Task 1: Install use-image + add Asset type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Install use-image**

```bash
cd apps/frontend && npm install use-image
```

Expected: `use-image` added to `package.json` dependencies. No errors.

- [ ] **Step 2: Add Asset interface to types.ts**

Open `src/lib/types.ts`. Append after the `Product` interface:

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

- [ ] **Step 3: Verify**

```bash
npm run build 2>&1 | tail -5
```

Expected: build completes without TypeScript errors on types.ts.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/package.json apps/frontend/package-lock.json apps/frontend/src/lib/types.ts
git commit -m "feat: add Asset type and use-image dependency"
```

---

## Task 2: Build useAssets hook + export getProduct

**Files:**
- Create: `src/hooks/useAssets.ts`
- Modify: `src/hooks/useProducts.ts`

- [ ] **Step 1: Export standalone getProduct from useProducts.ts**

Open `src/hooks/useProducts.ts`. The `getProduct` function is currently defined inside `useProducts()`. Extract it as a named export above the hook. Replace the existing file with:

```ts
import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Product } from '@/lib/types';

export async function getProduct(id: string): Promise<Product | null> {
  try {
    const docRef = doc(db, 'products', id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() } as Product;
    }
    return null;
  } catch (err) {
    console.error('Error fetching product:', err);
    return null;
  }
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      setLoading(true);
      const productsCol = collection(db, 'products');
      const q = query(productsCol, orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Product[];
      setProducts(items);
    } catch (err: unknown) {
      console.error('Error fetching products:', err);
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  return { products, loading, error, refresh: fetchProducts, getProduct };
}

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
        setProducts(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product),
        );
      } catch (err: unknown) {
        console.error('[useFeaturedProducts]', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load featured products',
        );
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
    if (count < 1) {
      setLoading(false);
      return;
    }
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
        setProducts(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product,
          ),
        );
      } catch (err: unknown) {
        console.error('[useRecentProducts]', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load recent products',
        );
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [count]);

  return { products, loading, error };
}
```

- [ ] **Step 2: Create useAssets.ts**

Create `src/hooks/useAssets.ts`:

```ts
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Asset } from '@/lib/types';

export function useAssets(count = 20) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'assets'),
          orderBy('createdAt', 'desc'),
          limit(count),
        );
        const snap = await getDocs(q);
        setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Asset));
      } catch (err: unknown) {
        console.error('[useAssets]', err);
        setError(err instanceof Error ? err.message : 'Failed to load assets');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [count]);

  return { assets, loading, error };
}

export async function getAsset(id: string): Promise<Asset | null> {
  try {
    const snap = await getDoc(doc(db, 'assets', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Asset;
  } catch (err) {
    console.error('[getAsset]', err);
    return null;
  }
}
```

- [ ] **Step 3: Verify**

```bash
npm run lint && npm run build 2>&1 | tail -10
```

Expected: no errors on `useAssets.ts` or `useProducts.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/hooks/useAssets.ts apps/frontend/src/hooks/useProducts.ts
git commit -m "feat: add useAssets hook and export standalone getProduct/getAsset"
```

---

## Task 3: Build gallery page

**Files:**
- Create: `src/app/studio/gallery/page.tsx`

- [ ] **Step 1: Create the gallery page**

Create `src/app/studio/gallery/page.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAssets } from '@/hooks/useAssets';
import { Asset } from '@/lib/types';
import { Button } from '@/components/ui/Button';

export default function GalleryPage() {
  const { assets, loading, error } = useAssets(20);
  const [selected, setSelected] = useState<Asset | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-white/5 px-6 py-4">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">AI Studio</p>
        <h1 className="text-2xl font-black text-primary">Pick Your Art</h1>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* Generate New CTA */}
        <Link
          href="/studio/generate"
          className="flex items-center gap-3 rounded-lg border border-dashed border-accent/50 bg-accent/5 p-4 transition-colors hover:bg-accent/10"
        >
          <span className="text-xl">✨</span>
          <div>
            <p className="text-sm font-semibold text-accent">Generate New Art</p>
            <p className="text-xs text-muted">Create something unique with DALL·E →</p>
          </div>
        </Link>

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-secondary" />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && assets.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-primary">No art yet</p>
            <p className="text-xs text-muted">Be the first to generate!</p>
          </div>
        )}

        {/* Asset grid */}
        {!loading && !error && assets.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() =>
                    setSelected(asset.id === selected?.id ? null : asset)
                  }
                  className={`overflow-hidden rounded-lg border-2 transition-colors ${
                    selected?.id === asset.id
                      ? 'border-accent'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="relative aspect-square bg-secondary">
                    <Image
                      src={asset.imageUrl}
                      alt={asset.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="p-2 text-left">
                    <p className="truncate text-xs font-medium text-primary">
                      {asset.title}
                    </p>
                    {asset.niche && (
                      <p className="text-xs text-muted">{asset.niche}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <Button
              variant="primary"
              size="lg"
              disabled={!selected}
              onClick={() =>
                selected && router.push(`/studio/apply?assetId=${selected.id}`)
              }
              className="w-full"
            >
              Use This Art →
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run build 2>&1 | tail -10
```

Expected: no errors. If Next.js warns about missing `width`/`height` on `<Image fill>`, confirm the parent has `position: relative` — the `relative aspect-square` class on the wrapper satisfies this.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/studio/gallery/page.tsx
git commit -m "feat: add studio gallery page for asset browsing"
```

---

## Task 4: Build apply page

**Files:**
- Create: `src/app/studio/apply/page.tsx`

- [ ] **Step 1: Create the apply page**

Create `src/app/studio/apply/page.tsx`:

```tsx
'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { getAsset } from '@/hooks/useAssets';
import { useProducts } from '@/hooks/useProducts';
import { Asset, Product } from '@/lib/types';
import { Button } from '@/components/ui/Button';

function ApplyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const assetId = searchParams.get('assetId');

  const [asset, setAsset] = useState<Asset | null>(null);
  const [assetLoading, setAssetLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { products, loading: productsLoading } = useProducts();

  useEffect(() => {
    if (!assetId) {
      router.replace('/studio/gallery');
      return;
    }
    getAsset(assetId).then((a) => {
      if (!a) {
        router.replace('/studio/gallery');
        return;
      }
      setAsset(a);
      setAssetLoading(false);
    });
  }, [assetId, router]);

  if (assetLoading || productsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="animate-pulse text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-white/5 px-6 py-4">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">AI Studio</p>
        <h1 className="text-2xl font-black text-primary">Choose a Product</h1>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* Selected asset preview */}
        {asset && (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-secondary p-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md">
              <Image
                src={asset.imageUrl}
                alt={asset.title}
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-primary">
                {asset.title}
              </p>
              <p className="text-xs text-muted">Your selected art</p>
            </div>
            <button
              onClick={() => router.push('/studio/gallery')}
              className="shrink-0 text-xs text-accent underline"
            >
              Change
            </button>
          </div>
        )}

        <p className="text-xs tracking-[0.2em] text-muted uppercase">
          Pick a product
        </p>

        {/* Product list */}
        <div className="flex flex-col gap-2">
          {products.map((product) => {
            const image =
              product.mockupImageUrl ||
              product.mockup_image_url ||
              product.imageUrl ||
              product.mockup_base_image ||
              null;
            const price = product.price ?? product.base_price ?? 0;
            const isSelected = selectedProduct?.id === product.id;

            return (
              <button
                key={product.id}
                onClick={() =>
                  setSelectedProduct(isSelected ? null : product)
                }
                className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-accent'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-background">
                  {image ? (
                    <Image
                      src={image}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">
                      ?
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold ${
                      isSelected ? 'text-accent' : 'text-primary'
                    }`}
                  >
                    {product.name}
                  </p>
                  <p className="text-xs text-muted">${price.toFixed(2)}</p>
                </div>
                {isSelected && (
                  <span className="shrink-0 text-sm text-accent">✓</span>
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="primary"
          size="lg"
          disabled={!selectedProduct}
          onClick={() =>
            selectedProduct &&
            router.push(
              `/studio/compose?assetId=${assetId}&productId=${selectedProduct.id}`,
            )
          }
          className="w-full"
        >
          Compose Design →
        </Button>
      </div>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="animate-pulse text-sm text-muted">Loading…</p>
        </div>
      }
    >
      <ApplyContent />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/studio/apply/page.tsx
git commit -m "feat: add studio apply page for product selection"
```

---

## Task 5: Build KonvaComposer component

**Files:**
- Create: `src/components/studio/KonvaComposer.tsx`

- [ ] **Step 1: Create the components/studio directory and KonvaComposer**

Create `src/components/studio/KonvaComposer.tsx`:

```tsx
'use client';

import React, { RefObject, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';

interface KonvaComposerProps {
  assetUrl: string;
  productMockupUrl: string;
  stageRef: RefObject<Konva.Stage>;
}

const STAGE_SIZE = 600;

function ProductBackground({ url }: { url: string }) {
  const [image] = useImage(url, 'anonymous');
  return (
    <KonvaImage
      image={image}
      width={STAGE_SIZE}
      height={STAGE_SIZE}
      listening={false}
    />
  );
}

function DraggableAsset({ url }: { url: string }) {
  const [image] = useImage(url, 'anonymous');
  const imageRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (image && imageRef.current && transformerRef.current) {
      transformerRef.current.nodes([imageRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [image]);

  const size = STAGE_SIZE * 0.4;
  const pos = (STAGE_SIZE - size) / 2;

  return (
    <>
      <KonvaImage
        ref={imageRef}
        image={image}
        x={pos}
        y={pos}
        width={size}
        height={size}
        draggable
      />
      <Transformer ref={transformerRef} rotateEnabled={false} />
    </>
  );
}

export default function KonvaComposer({
  assetUrl,
  productMockupUrl,
  stageRef,
}: KonvaComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setScale(containerRef.current.offsetWidth / STAGE_SIZE);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-lg border border-white/10"
      style={{ aspectRatio: '1 / 1' }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: STAGE_SIZE,
          height: STAGE_SIZE,
        }}
      >
        <Stage ref={stageRef} width={STAGE_SIZE} height={STAGE_SIZE}>
          <Layer>
            <ProductBackground url={productMockupUrl} />
          </Layer>
          <Layer>
            <DraggableAsset url={assetUrl} />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run build 2>&1 | tail -10
```

Expected: no errors. Note: `use-image` exports a default — if TypeScript complains about the import, add `"allowSyntheticDefaultImports": true` to `tsconfig.json` (it's usually already set in Next.js projects).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/studio/KonvaComposer.tsx
git commit -m "feat: add KonvaComposer canvas component for art composition"
```

---

## Task 6: Build compose page

**Files:**
- Create: `src/app/studio/compose/page.tsx`

- [ ] **Step 1: Create the compose page**

Create `src/app/studio/compose/page.tsx`:

```tsx
'use client';

import React, { useRef, useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import Konva from 'konva';
import { getAsset } from '@/hooks/useAssets';
import { getProduct } from '@/hooks/useProducts';
import { Asset, Product } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { useCart } from '@/context/CartContext';

const KonvaComposer = dynamic(
  () => import('@/components/studio/KonvaComposer'),
  { ssr: false },
);

function ComposeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addItem } = useCart();

  const assetId = searchParams.get('assetId');
  const productId = searchParams.get('productId');

  const stageRef = useRef<Konva.Stage>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId || !productId) {
      router.replace('/studio/gallery');
      return;
    }
    Promise.all([getAsset(assetId), getProduct(productId)]).then(([a, p]) => {
      if (!a || !p) {
        router.replace('/studio/gallery');
        return;
      }
      setAsset(a);
      setProduct(p);
      setLoading(false);
    });
  }, [assetId, productId, router]);

  const handleSaveAndAddToCart = async () => {
    if (!stageRef.current || !asset || !product || !assetId || !productId) return;

    setSaving(true);
    setSaveError(null);

    try {
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });

      const res = await fetch('/api/save-mockup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, assetId, productId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save mockup');
      }

      const { imageUrl } = await res.json();

      addItem({ ...product, mockupImageUrl: imageUrl }, 1, assetId);
      router.push('/cart');
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save. Please try again.',
      );
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="animate-pulse text-sm text-muted">Loading your studio…</p>
      </div>
    );
  }

  const productMockupUrl =
    product?.mockup_base_image ||
    product?.mockupImageUrl ||
    product?.mockup_image_url ||
    product?.imageUrl ||
    '';

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-white/5 px-6 py-4">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">AI Studio</p>
        <h1 className="text-2xl font-black text-primary">Position Your Art</h1>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-xs text-muted">
          Drag to move · Pinch or scroll to resize
        </p>

        {/* Canvas */}
        <div className="relative">
          <KonvaComposer
            assetUrl={asset!.imageUrl}
            productMockupUrl={productMockupUrl}
            stageRef={stageRef}
          />
          {saving && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60">
              <p className="animate-pulse text-sm text-white">
                Saving your design…
              </p>
            </div>
          )}
        </div>

        {/* Product info + change link */}
        {product && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-primary">{product.name}</p>
              <p className="text-xs text-muted">
                ${(product.price ?? product.base_price ?? 0).toFixed(2)}
              </p>
            </div>
            <button
              onClick={() => router.push(`/studio/apply?assetId=${assetId}`)}
              className="text-xs text-accent underline"
            >
              Change product
            </button>
          </div>
        )}

        {saveError && (
          <p className="text-sm text-red-400">{saveError}</p>
        )}

        <Button
          variant="primary"
          size="lg"
          onClick={handleSaveAndAddToCart}
          disabled={saving}
          className="w-full"
        >
          {saving ? 'Saving…' : 'Save & Add to Cart →'}
        </Button>

        <p className="text-center text-xs text-muted">
          Your design is saved before adding to cart
        </p>
      </div>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="animate-pulse text-sm text-muted">Loading…</p>
        </div>
      }
    >
      <ComposeContent />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/studio/compose/page.tsx
git commit -m "feat: add studio compose page with Konva canvas and save-to-cart flow"
```

---

## Task 7: Update generate page — add "Apply to Product →"

**Files:**
- Modify: `src/app/studio/generate/page.tsx:206-228`

- [ ] **Step 1: Add "Apply to Product →" button to result cards**

Open `src/app/studio/generate/page.tsx`. Find the result card's `<div className="p-3">` block (around line 219). Replace it with:

```tsx
                    {/* Card info */}
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-primary">{asset.title}</p>
                      {asset.niche && (
                        <p className="mt-0.5 text-xs text-muted">{asset.niche}</p>
                      )}
                      <a
                        href={`/studio/apply?assetId=${asset.id}`}
                        className="mt-2 block text-center text-xs font-semibold text-accent hover:underline"
                      >
                        Apply to Product →
                      </a>
                    </div>
```

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/studio/generate/page.tsx
git commit -m "feat: add 'Apply to Product' link on generate result cards"
```

---

## Task 8: Fix "Customize with AI" link on product detail page

**Files:**
- Modify: `src/app/products/[productId]/page.tsx:152-165`

- [ ] **Step 1: Update the link target**

Open `src/app/products/[productId]/page.tsx`. Find the `{product.defaultAssetId ? (` block (around line 152). Replace the entire conditional:

```tsx
              {product.defaultAssetId ? (
                <Link
                  href={`/studio/compose?assetId=${product.defaultAssetId}&productId=${product.id}`}
                  className="flex-1"
                >
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full border-white/20 hover:border-cyan-400 rounded-full py-6"
                  >
                    Customize with AI
                  </Button>
                </Link>
              ) : (
                <Button
                  size="lg"
                  variant="secondary"
                  disabled
                  className="flex-1 opacity-20 cursor-not-allowed rounded-full py-6"
                >
                  Customization Locked
                </Button>
              )}
```

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/products/[productId]/page.tsx
git commit -m "fix: update 'Customize with AI' link to target /studio/compose"
```

---

## Task 9: End-to-end smoke test

All three entry points must work. Start the dev server and test each path manually.

- [ ] **Step 1: Start the dev server**

```bash
cd apps/frontend && nvm use && npm run dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: Test Entry Point 1 — Browse first**

1. Navigate to `http://localhost:3000/studio/gallery`
2. Confirm: asset grid loads (or empty state + "Generate New Art" CTA if no assets in Firestore)
3. Click an asset card — confirm border highlights and "Use This Art →" activates
4. Click "Use This Art →" — confirm navigation to `/studio/apply?assetId=<id>`
5. On apply page: confirm selected asset preview appears at top
6. Click a product — confirm it highlights
7. Click "Compose Design →" — confirm navigation to `/studio/compose?assetId=X&productId=Y`
8. On compose page: confirm Konva canvas loads with product mockup background + asset overlay
9. Drag the asset — confirm it moves
10. Resize via corner handles — confirm it scales
11. Click "Save & Add to Cart →" — confirm spinner appears, then redirect to `/cart`
12. On cart page: confirm the item appears with the custom mockup image

- [ ] **Step 3: Test Entry Point 2 — Generate first**

1. Navigate to `http://localhost:3000/studio/generate`
2. Enter a prompt and generate (or use an existing asset if DALL-E quota is tight)
3. On a result card, confirm "Apply to Product →" link is visible
4. Click it — confirm navigation to `/studio/apply?assetId=<id>`
5. Continue through apply → compose → cart as above

- [ ] **Step 4: Test Entry Point 3 — From product detail**

1. Navigate to any product at `http://localhost:3000/products/<id>`
2. If the product has a `defaultAssetId`, confirm "Customize with AI" button is active (not "Customization Locked")
3. Click "Customize with AI" — confirm navigation goes directly to `/studio/compose?assetId=<defaultAssetId>&productId=<id>` (skipping gallery and apply)
4. Continue through compose → cart as above

- [ ] **Step 5: Test error path**

Navigate to `http://localhost:3000/studio/apply` (no `assetId` param). Confirm redirect to `/studio/gallery`.

Navigate to `http://localhost:3000/studio/compose` (no params). Confirm redirect to `/studio/gallery`.

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -p  # stage only intentional changes
git commit -m "fix: <description of any smoke test fixes>"
```

---

## Notes

- **If Firestore has no assets:** The gallery will show the empty state. Use `/studio/generate` to create assets first, then return to the gallery — they'll appear automatically (no published filter).
- **If a product has no `mockup_base_image`:** The compose canvas will show a plain dark background. This is expected — the design spec calls for a graceful fallback.
- **CORS on Konva canvas export:** `useImage(url, 'anonymous')` is required for `toDataURL()` to work without throwing a security error. Firebase Storage download URLs support anonymous CORS by default.
- **Deferred (Sprint 6):** Prompt remix ("use as template, modify prompt, regenerate") and unified desktop studio workspace.
