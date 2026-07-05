# Printify Import/Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin manually import Printify products that exist on Printify but have no matching Firestore `assets` doc, so they appear on `/shop`, while bundling two related bug fixes discovered in `admin/assets/page.tsx`.

**Architecture:** Three new server-only Next.js API routes (`preview`, `commit`, `ignore`) built on small, independently-testable pure functions in `src/lib/printify.ts` (category lookup, pagination, dedup filtering). A new `/admin/printify-import` review page drives them. Imported products land in the existing `assets` collection, tagged `importSource: 'printify-import'` so `/gallery` can exclude them.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Firebase Admin SDK (Firestore), Printify REST API, Vitest (new — pure-logic unit tests only), manual Playwright verification for routes/UI (matches this project's existing convention; no `@playwright/test` package is installed).

## Global Constraints

- All new API routes use `export const runtime = 'nodejs';` and the `adminDb` / `FieldValue` exports from `src/lib/firebaseAdmin.ts` — same pattern as `src/app/api/refresh-mockup/route.ts`.
- No new auth gate on `/admin/*` — consistent with every existing admin route/page today.
- Category options for the admin UI dropdown: `shirt`, `hoodie`, `tote`, `mug`, `cup`, `sticker` (the 5 existing categories plus the one new one this session's audit requires).
- Firestore field naming on `assets` docs: `productCategory` (camelCase) — matches `Asset.productCategory` in `src/lib/types.ts` and the existing `publish-to-printify/route.ts` write convention.
- Test strategy (per user decision): Vitest for pure logic only (category lookup, pagination-with-cap, dedup filtering, image-label mapping). Route handlers and UI are verified manually via `tsc --noEmit`, `npm run lint`, and live Playwright browser checks against the local dev server — no new test-framework infra for those.
- Do not modify `/shop/page.tsx`, `/shop/[productId]/page.tsx`, or `ProductTileImage.tsx` — the spec confirms zero changes needed there.

---

### Task 1: Vitest setup + blueprint→category lookup

**Files:**
- Create: `apps/frontend/vitest.config.ts`
- Modify: `apps/frontend/package.json` (add `vitest` devDependency, add `"test"` script)
- Create: `apps/frontend/src/lib/printify.test.ts`
- Modify: `apps/frontend/src/lib/printify.ts`

**Interfaces:**
- Produces: `BLUEPRINT_CATEGORY_MAP: Record<number, string>`, `suggestCategoryForBlueprint(blueprintId: number): string | undefined` — both exported from `src/lib/printify.ts`, consumed by Task 4 (preview route).

- [ ] **Step 1: Install Vitest**

Run: `cd apps/frontend && npm install -D vitest`
Expected: `vitest` added to `devDependencies` in `package.json`.

- [ ] **Step 2: Add Vitest config**

Create `apps/frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add the test script**

In `apps/frontend/package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write the failing test**

Create `apps/frontend/src/lib/printify.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { suggestCategoryForBlueprint } from './printify';

describe('suggestCategoryForBlueprint', () => {
  it('returns shirt for blueprint 12 (app default shirt)', () => {
    expect(suggestCategoryForBlueprint(12)).toBe('shirt');
  });

  it('returns sticker for blueprint 400 (Kiss-Cut Stickers)', () => {
    expect(suggestCategoryForBlueprint(400)).toBe('sticker');
  });

  it('returns tote for blueprint 1313 (Cotton Canvas Tote Bag)', () => {
    expect(suggestCategoryForBlueprint(1313)).toBe('tote');
  });

  it('returns hoodie for blueprint 77 (alternate hoodie blueprint)', () => {
    expect(suggestCategoryForBlueprint(77)).toBe('hoodie');
  });

  it('returns shirt for blueprint 706 (alternate shirt blueprint)', () => {
    expect(suggestCategoryForBlueprint(706)).toBe('shirt');
  });

  it('returns undefined for an unrecognized blueprint id', () => {
    expect(suggestCategoryForBlueprint(999999)).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/lib/printify.test.ts`
Expected: FAIL — `suggestCategoryForBlueprint` is not exported / not a function.

- [ ] **Step 6: Implement the lookup table and function**

In `apps/frontend/src/lib/printify.ts`, add after the existing `PRINT_PROVIDER_IDS` block (after line 36):

```ts
// Blueprint id -> category, for products not created through this app's
// own publish pipeline. Extends the 5 app-default blueprints above with
// blueprints discovered on Printify's own dashboard (audit: 2026-07-05).
export const BLUEPRINT_CATEGORY_MAP: Record<number, string> = {
  12: 'shirt',    // app default
  92: 'hoodie',   // app default
  553: 'tote',    // app default
  68: 'mug',      // app default
  425: 'cup',     // app default
  400: 'sticker', // Kiss-Cut Stickers
  1313: 'tote',   // Cotton Canvas Tote Bag
  77: 'hoodie',   // Unisex Heavy Blend Hooded Sweatshirt
  706: 'shirt',   // Unisex Garment-Dyed T-shirt
};

export function suggestCategoryForBlueprint(blueprintId: number): string | undefined {
  return BLUEPRINT_CATEGORY_MAP[blueprintId];
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/lib/printify.test.ts`
Expected: PASS — all 6 assertions green.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/package.json apps/frontend/package-lock.json apps/frontend/vitest.config.ts apps/frontend/src/lib/printify.test.ts apps/frontend/src/lib/printify.ts
git commit -m "test: add Vitest and blueprint-to-category lookup for Printify import"
```

---

### Task 2: Pagination, dedup-filter, and image-mapping pure functions

**Files:**
- Modify: `apps/frontend/src/lib/printify.ts`
- Modify: `apps/frontend/src/lib/printify.test.ts`

**Interfaces:**
- Consumes: none new (standalone pure functions).
- Produces: `PrintifyProductSummary` (interface), `fetchAllPrintifyProducts(fetchPage)`, `filterUnmatchedProducts(products, trackedIds, ignoredIds)`, `mapPrintifyImages(images)` — all exported from `src/lib/printify.ts`. Task 4 (preview route) consumes all four; `getPrintifyMockupImages` (existing function) is refactored to call `mapPrintifyImages` instead of duplicating its logic.

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/lib/printify.test.ts`:

```ts
import { fetchAllPrintifyProducts, filterUnmatchedProducts, mapPrintifyImages } from './printify';

describe('fetchAllPrintifyProducts', () => {
  it('collects products across multiple pages', async () => {
    const pages = [
      { data: [{ id: '1', title: 'A', blueprint_id: 12, print_provider_id: 99, images: [] }], current_page: 1, last_page: 2 },
      { data: [{ id: '2', title: 'B', blueprint_id: 400, print_provider_id: 1, images: [] }], current_page: 2, last_page: 2 },
    ];
    const fetchPage = async (page: number) => pages[page - 1];
    const result = await fetchAllPrintifyProducts(fetchPage);
    expect(result.map((p) => p.id)).toEqual(['1', '2']);
  });

  it('stops after a hard cap even if last_page never matches current_page', async () => {
    let calls = 0;
    const fetchPage = async (page: number) => {
      calls += 1;
      return { data: [], current_page: page, last_page: 999999 };
    };
    await fetchAllPrintifyProducts(fetchPage);
    expect(calls).toBe(50);
  });
});

describe('filterUnmatchedProducts', () => {
  const products = [
    { id: 'a', title: 'A', blueprint_id: 12, print_provider_id: 99, images: [] },
    { id: 'b', title: 'B', blueprint_id: 400, print_provider_id: 1, images: [] },
    { id: 'c', title: 'C', blueprint_id: 12, print_provider_id: 99, images: [] },
  ];

  it('excludes tracked and ignored product ids', () => {
    const result = filterUnmatchedProducts(products, new Set(['a']), new Set(['c']));
    expect(result.map((p) => p.id)).toEqual(['b']);
  });

  it('returns all products when nothing is tracked or ignored', () => {
    const result = filterUnmatchedProducts(products, new Set(), new Set());
    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('mapPrintifyImages', () => {
  it('labels the default image Front and numbers alternates in order', () => {
    const result = mapPrintifyImages([
      { src: 'https://x/1.png', is_default: false },
      { src: 'https://x/2.png', is_default: true },
      { src: 'https://x/3.png', is_default: false },
    ]);
    expect(result).toEqual([
      { src: 'https://x/1.png', label: 'Alternate 1', isDefault: false },
      { src: 'https://x/2.png', label: 'Front', isDefault: true },
      { src: 'https://x/3.png', label: 'Alternate 2', isDefault: false },
    ]);
  });

  it('returns an empty array for no images', () => {
    expect(mapPrintifyImages([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/printify.test.ts`
Expected: FAIL — `fetchAllPrintifyProducts`, `filterUnmatchedProducts`, `mapPrintifyImages` not exported.

- [ ] **Step 3: Implement the three functions**

In `apps/frontend/src/lib/printify.ts`, add after the `suggestCategoryForBlueprint` function from Task 1:

```ts
export interface PrintifyProductSummary {
  id: string;
  title: string;
  blueprint_id: number;
  print_provider_id: number;
  images: { src: string; is_default?: boolean }[];
}

interface PrintifyProductsPage {
  data: PrintifyProductSummary[];
  current_page: number;
  last_page: number;
}

const MAX_PRODUCT_PAGES = 50;

export async function fetchAllPrintifyProducts(
  fetchPage: (page: number) => Promise<PrintifyProductsPage>,
): Promise<PrintifyProductSummary[]> {
  const all: PrintifyProductSummary[] = [];
  let page = 1;
  while (page <= MAX_PRODUCT_PAGES) {
    const result = await fetchPage(page);
    all.push(...result.data);
    if (page >= result.last_page) break;
    page += 1;
  }
  return all;
}

export function filterUnmatchedProducts(
  products: PrintifyProductSummary[],
  trackedIds: Set<string>,
  ignoredIds: Set<string>,
): PrintifyProductSummary[] {
  return products.filter((p) => !trackedIds.has(p.id) && !ignoredIds.has(p.id));
}

export function mapPrintifyImages(
  images: { src: string; is_default?: boolean }[],
): PrintifyMockupImage[] {
  let altCount = 0;
  return images.map((img) => {
    const isDefault = !!img.is_default;
    return { src: img.src, label: isDefault ? 'Front' : `Alternate ${++altCount}`, isDefault };
  });
}
```

Then refactor the existing `getPrintifyMockupImages` function to reuse `mapPrintifyImages` instead of duplicating the label logic. Replace:

```ts
    if (images.length > 0) {
      let altCount = 0;
      return images.map((img) => {
        const isDefault = !!img.is_default;
        return { src: img.src, label: isDefault ? 'Front' : `Alternate ${++altCount}`, isDefault };
      });
    }
```

with:

```ts
    if (images.length > 0) {
      return mapPrintifyImages(images);
    }
```

(`PrintifyMockupImage` is already defined above `getPrintifyMockupImages` in this file — no new import needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/printify.test.ts`
Expected: PASS — all tests (Task 1's 6 + this task's 6) green.

- [ ] **Step 5: Regression-check the refactor**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors (confirms `getPrintifyMockupImages`'s refactor didn't change its public signature or break callers).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/lib/printify.ts apps/frontend/src/lib/printify.test.ts
git commit -m "feat: add Printify pagination, dedup-filter, and image-mapping helpers"
```

---

### Task 3: Asset type fields for imported products

**Files:**
- Modify: `apps/frontend/src/lib/types.ts`

**Interfaces:**
- Produces: `Asset.printifyBlueprintId?: number`, `Asset.printifyPrintProviderId?: number`, `Asset.importSource?: 'printify-import'` — consumed by Task 5 (commit route, writes them) and Task 9 (gallery filter, reads `importSource`).

- [ ] **Step 1: Add the fields**

In `apps/frontend/src/lib/types.ts`, in the `Asset` interface, add after `designGroupId?: string;`:

```ts
  printifyBlueprintId?: number;
  printifyPrintProviderId?: number;
  importSource?: 'printify-import';
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/types.ts
git commit -m "feat: add Printify-import fields to Asset type"
```

---

### Task 4: `GET /api/printify-import/preview` route

**Files:**
- Create: `apps/frontend/src/app/api/printify-import/preview/route.ts`

**Interfaces:**
- Consumes: `fetchAllPrintifyProducts`, `filterUnmatchedProducts`, `suggestCategoryForBlueprint`, `mapPrintifyImages`, `PrintifyProductSummary` from `src/lib/printify.ts` (Tasks 1-2); `adminDb` from `src/lib/firebaseAdmin.ts`.
- Produces: `GET /api/printify-import/preview` → `{ products: PreviewItem[] }` where `PreviewItem = { printifyProductId: string; title: string; blueprintId: number; printProviderId: number; suggestedCategory?: string; mockupImages: { src: string; label: string; isDefault: boolean }[] }`. Consumed by Task 7 (admin UI).

- [ ] **Step 1: Implement the route**

Create `apps/frontend/src/app/api/printify-import/preview/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  fetchAllPrintifyProducts,
  filterUnmatchedProducts,
  suggestCategoryForBlueprint,
  mapPrintifyImages,
  type PrintifyProductSummary,
} from '@/lib/printify';

export const runtime = 'nodejs';

const PRINTIFY_BASE = 'https://api.printify.com/v1';

export interface PreviewItem {
  printifyProductId: string;
  title: string;
  blueprintId: number;
  printProviderId: number;
  suggestedCategory?: string;
  mockupImages: { src: string; label: string; isDefault: boolean }[];
}

export async function GET() {
  try {
    const apiKey = process.env.PRINTIFY_API_KEY;
    const shopId = process.env.PRINTIFY_SHOP_ID;
    if (!apiKey || !shopId) {
      return NextResponse.json(
        { error: 'PRINTIFY_API_KEY / PRINTIFY_SHOP_ID are not set' },
        { status: 500 },
      );
    }

    const products = await fetchAllPrintifyProducts(async (page) => {
      const res = await fetch(
        `${PRINTIFY_BASE}/shops/${shopId}/products.json?page=${page}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!res.ok) {
        throw new Error(`Printify products fetch failed: ${res.status}`);
      }
      return res.json() as Promise<{
        data: PrintifyProductSummary[];
        current_page: number;
        last_page: number;
      }>;
    });

    const trackedSnap = await adminDb.collection('assets').select('printifyProductId').get();
    const trackedIds = new Set(
      trackedSnap.docs
        .map((d) => d.get('printifyProductId') as string | undefined)
        .filter((id): id is string => !!id),
    );

    const ignoredSnap = await adminDb.collection('printifyImportIgnores').get();
    const ignoredIds = new Set(ignoredSnap.docs.map((d) => d.id));

    const unmatched = filterUnmatchedProducts(products, trackedIds, ignoredIds);

    const items: PreviewItem[] = unmatched.map((p) => ({
      printifyProductId: p.id,
      title: p.title,
      blueprintId: p.blueprint_id,
      printProviderId: p.print_provider_id,
      suggestedCategory: suggestCategoryForBlueprint(p.blueprint_id),
      mockupImages: mapPrintifyImages(p.images ?? []),
    }));

    return NextResponse.json({ products: items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-import/preview error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify against live Printify/Firestore (read-only, safe)**

Run: `cd apps/frontend && npm run dev` (in one terminal), then in another:
`curl -s http://localhost:3000/api/printify-import/preview | python3 -m json.tool`

Expected: a JSON object with a `products` array containing entries for the untracked products from this session's audit (Kiss-Cut Stickers with `suggestedCategory: "sticker"`, Cotton Canvas Tote Bag with `"tote"`, the alternate hoodie/shirt with `"hoodie"`/`"shirt"`, and the 4 duplicate shirt products) — roughly 11 items total, none of which are among the 8 already-tracked assets.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/api/printify-import/preview/route.ts
git commit -m "feat: add Printify import preview API route"
```

---

### Task 5: `POST /api/printify-import/commit` route

**Files:**
- Create: `apps/frontend/src/app/api/printify-import/commit/route.ts`

**Interfaces:**
- Consumes: `adminDb`, `FieldValue` from `src/lib/firebaseAdmin.ts`; the `Asset` fields added in Task 3.
- Produces: `POST /api/printify-import/commit` — body `{ printifyProductId: string; title: string; category: string; blueprintId?: number; printProviderId?: number; mockupImages?: MockupImage[] }` → `{ success: true; assetId: string }` on success, `{ error: string }` with 400/500 on failure. Consumed by Task 7 (admin UI).

- [ ] **Step 1: Implement the route**

Create `apps/frontend/src/app/api/printify-import/commit/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

interface MockupImage {
  src: string;
  label: string;
  isDefault: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { printifyProductId, title, category, blueprintId, printProviderId, mockupImages } = body ?? {};

    if (!printifyProductId || !title || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: printifyProductId, title, category' },
        { status: 400 },
      );
    }

    const images: MockupImage[] = Array.isArray(mockupImages) ? mockupImages : [];
    const mockupUrl = images.find((img) => img.isDefault)?.src ?? images[0]?.src ?? null;

    const docRef = await adminDb.collection('assets').add({
      title: String(title),
      productCategory: String(category),
      printifyProductId: String(printifyProductId),
      printifyStatus: 'published',
      printifyBlueprintId: blueprintId != null ? Number(blueprintId) : null,
      printifyPrintProviderId: printProviderId != null ? Number(printProviderId) : null,
      mockupImages: images,
      mockupUrl,
      importSource: 'printify-import',
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, assetId: docRef.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-import/commit error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/api/printify-import/commit/route.ts
git commit -m "feat: add Printify import commit API route"
```

*(Functional verification — actually importing a real product — happens in Task 10's end-to-end pass, not here, to avoid writing throwaway data to production Firestore mid-task.)*

---

### Task 6: `POST /api/printify-import/ignore` route

**Files:**
- Create: `apps/frontend/src/app/api/printify-import/ignore/route.ts`

**Interfaces:**
- Consumes: `adminDb`, `FieldValue` from `src/lib/firebaseAdmin.ts`.
- Produces: `POST /api/printify-import/ignore` — body `{ printifyProductId: string; title?: string }` → `{ success: true }` on success, `{ error: string }` with 400/500 on failure. Consumed by Task 7 (admin UI). Writes to the `printifyImportIgnores` collection, which Task 4's `preview` route reads.

- [ ] **Step 1: Implement the route**

Create `apps/frontend/src/app/api/printify-import/ignore/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { printifyProductId, title } = body ?? {};

    if (!printifyProductId) {
      return NextResponse.json(
        { error: 'Missing required field: printifyProductId' },
        { status: 400 },
      );
    }

    await adminDb.collection('printifyImportIgnores').doc(String(printifyProductId)).set({
      title: title ? String(title) : '',
      ignoredAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-import/ignore error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/api/printify-import/ignore/route.ts
git commit -m "feat: add Printify import ignore API route"
```

---

### Task 7: `/admin/printify-import` review page

**Files:**
- Create: `apps/frontend/src/app/admin/printify-import/page.tsx`

**Interfaces:**
- Consumes: `GET /api/printify-import/preview` (Task 4), `POST /api/printify-import/commit` (Task 5), `POST /api/printify-import/ignore` (Task 6).
- Produces: the `/admin/printify-import` route, linked from `admin/assets/page.tsx` in Task 8.

- [ ] **Step 1: Implement the page**

Create `apps/frontend/src/app/admin/printify-import/page.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface MockupImage {
  src: string;
  label: string;
  isDefault: boolean;
}

interface PreviewItem {
  printifyProductId: string;
  title: string;
  blueprintId: number;
  printProviderId: number;
  suggestedCategory?: string;
  mockupImages: MockupImage[];
}

const CATEGORY_OPTIONS = ['shirt', 'hoodie', 'tote', 'mug', 'cup', 'sticker'];

export default function PrintifyImportPage() {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<Record<string, 'import' | 'ignore' | undefined>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const scan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/printify-import/preview');
      const data = (await res.json()) as { error?: string; products?: PreviewItem[] };
      if (!res.ok) throw new Error(data.error ?? 'Scan failed');
      const products = data.products ?? [];
      setItems(products);
      setCategoryDrafts((prev) => {
        const next = { ...prev };
        for (const item of products) {
          if (!(item.printifyProductId in next)) {
            next[item.printifyProductId] = item.suggestedCategory ?? '';
          }
        }
        return next;
      });
      setScanned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  };

  const importRow = async (item: PreviewItem) => {
    const category = categoryDrafts[item.printifyProductId];
    if (!category) return;
    setPendingAction((prev) => ({ ...prev, [item.printifyProductId]: 'import' }));
    setRowErrors((prev) => ({ ...prev, [item.printifyProductId]: '' }));
    try {
      const res = await fetch('/api/printify-import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printifyProductId: item.printifyProductId,
          title: item.title,
          category,
          blueprintId: item.blueprintId,
          printProviderId: item.printProviderId,
          mockupImages: item.mockupImages,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setItems((prev) => prev.filter((p) => p.printifyProductId !== item.printifyProductId));
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [item.printifyProductId]: err instanceof Error ? err.message : 'Import failed',
      }));
    } finally {
      setPendingAction((prev) => ({ ...prev, [item.printifyProductId]: undefined }));
    }
  };

  const ignoreRow = async (item: PreviewItem) => {
    setPendingAction((prev) => ({ ...prev, [item.printifyProductId]: 'ignore' }));
    setRowErrors((prev) => ({ ...prev, [item.printifyProductId]: '' }));
    try {
      const res = await fetch('/api/printify-import/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printifyProductId: item.printifyProductId, title: item.title }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Ignore failed');
      setItems((prev) => prev.filter((p) => p.printifyProductId !== item.printifyProductId));
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [item.printifyProductId]: err instanceof Error ? err.message : 'Ignore failed',
      }));
    } finally {
      setPendingAction((prev) => ({ ...prev, [item.printifyProductId]: undefined }));
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/assets" className="text-sm text-accent underline">
          ← Back to Assets
        </Link>
        <h1 className="mt-2 text-2xl font-black text-primary">Import from Printify</h1>
        <p className="mb-4 text-sm text-muted">
          Finds Printify products with no matching asset in Firestore.
        </p>

        <button
          onClick={scan}
          disabled={loading}
          className="rounded-md border border-sky-500/30 px-3 py-1 text-xs font-medium text-sky-400 transition-colors hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Scanning…' : 'Scan Printify'}
        </button>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {scanned && items.length === 0 && !error && (
          <p className="mt-4 text-sm text-muted">No new Printify products found.</p>
        )}

        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <div
              key={item.printifyProductId}
              className="flex flex-wrap items-center gap-4 border-b border-white/10 pb-4"
            >
              {item.mockupImages[0] && (
                <Image
                  src={item.mockupImages[0].src}
                  alt={item.title}
                  width={80}
                  height={80}
                  className="rounded-md object-cover"
                />
              )}
              <div className="min-w-[180px]">
                <div className="font-medium">{item.title}</div>
                <div className="text-xs text-muted">Blueprint {item.blueprintId}</div>
              </div>
              <select
                value={categoryDrafts[item.printifyProductId] ?? ''}
                onChange={(e) =>
                  setCategoryDrafts((prev) => ({ ...prev, [item.printifyProductId]: e.target.value }))
                }
                className="rounded-md border border-white/20 bg-transparent px-2 py-1 text-sm"
              >
                <option value="">Select category…</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                onClick={() => importRow(item)}
                disabled={!categoryDrafts[item.printifyProductId] || !!pendingAction[item.printifyProductId]}
                className="rounded-md border border-emerald-500/30 px-3 py-1 text-xs font-medium text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pendingAction[item.printifyProductId] === 'import' ? 'Importing…' : 'Import'}
              </button>
              <button
                onClick={() => ignoreRow(item)}
                disabled={!!pendingAction[item.printifyProductId]}
                className="rounded-md border border-white/20 px-3 py-1 text-xs font-medium text-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pendingAction[item.printifyProductId] === 'ignore' ? 'Ignoring…' : 'Ignore'}
              </button>
              {rowErrors[item.printifyProductId] && (
                <p className="w-full text-xs text-red-400">{rowErrors[item.printifyProductId]}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/admin/printify-import/page.tsx
git commit -m "feat: add Printify import review page"
```

*(Full interactive verification — scan, import, ignore — happens in Task 10 alongside the admin/assets link added in Task 8.)*

---

### Task 8: Link button + bundled bug fixes in `admin/assets/page.tsx`

**Files:**
- Modify: `apps/frontend/src/app/admin/assets/page.tsx`

**Interfaces:**
- Consumes: `/admin/printify-import` (Task 7).
- Produces: no new exports; fixes existing `backfillAllMockups` and `refreshMockup` behavior in place.

- [ ] **Step 1: Fix the `backfillAllMockups` filter mismatch**

In `apps/frontend/src/app/admin/assets/page.tsx`, line 104, replace:

```ts
    const pending = assets.filter((a) => a.printifyProductId && !a.mockupUrl);
```

with:

```ts
    const pending = assets.filter((a) => a.printifyProductId && !a.mockupImages?.length);
```

- [ ] **Step 2: Fix `refreshMockup` dropping `mockupImages` from state**

Lines 86-92, replace:

```ts
      const data = await res.json() as { error?: string; mockupUrl?: string };
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed');
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id ? { ...a, mockupUrl: data.mockupUrl } : a,
        ),
      );
```

with:

```ts
      const data = await res.json() as { error?: string; mockupUrl?: string; mockupImages?: Asset['mockupImages'] };
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed');
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id ? { ...a, mockupUrl: data.mockupUrl, mockupImages: data.mockupImages } : a,
        ),
      );
```

- [ ] **Step 3: Fix the same gap in `backfillAllMockups`'s per-item update**

Lines 116-121, replace:

```ts
        const data = await res.json() as { error?: string; mockupUrl?: string };
        if (res.ok && data.mockupUrl) {
          setAssets((prev) =>
            prev.map((a) => (a.id === asset.id ? { ...a, mockupUrl: data.mockupUrl } : a)),
          );
        }
```

with:

```ts
        const data = await res.json() as { error?: string; mockupUrl?: string; mockupImages?: Asset['mockupImages'] };
        if (res.ok && data.mockupUrl) {
          setAssets((prev) =>
            prev.map((a) => (a.id === asset.id ? { ...a, mockupUrl: data.mockupUrl, mockupImages: data.mockupImages } : a)),
          );
        }
```

- [ ] **Step 4: Add the "Import from Printify" link**

Line 202-204, replace:

```tsx
            <Link href="/admin/products" className="text-sm text-accent underline">
              ← Products
            </Link>
```

with:

```tsx
            <Link href="/admin/printify-import" className="text-sm text-accent underline">
              Import from Printify →
            </Link>
            <Link href="/admin/products" className="text-sm text-accent underline">
              ← Products
            </Link>
```

- [ ] **Step 5: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run lint**

Run: `cd apps/frontend && npm run lint`
Expected: no new errors/warnings beyond the pre-existing ones noted in this session's memory (12 errors / 9 warnings unrelated to this file).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/app/admin/assets/page.tsx
git commit -m "fix: correct backfill filter and mockupImages state merge; link Printify import page"
```

---

### Task 9: Exclude imported products from `/gallery`

**Files:**
- Modify: `apps/frontend/src/app/gallery/page.tsx`

**Interfaces:**
- Consumes: `Asset.importSource` (Task 3).
- Produces: no new exports; `/gallery` no longer renders docs where `importSource === 'printify-import'`.

- [ ] **Step 1: Add the exclusion filter**

In `apps/frontend/src/app/gallery/page.tsx`, line 54, replace:

```ts
        const items = snap.docs.map((d) => {
```

with:

```ts
        const items = snap.docs
          .filter((d) => (d.data() as { importSource?: string }).importSource !== 'printify-import')
          .map((d) => {
```

(The existing `.map()` body and its closing `});` on line 70 are unchanged — this only adds a `.filter()` before it in the chain.)

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/gallery/page.tsx
git commit -m "feat: exclude Printify-imported products from gallery"
```

---

### Task 10: End-to-end verification and whole-feature review

**Files:** none created or modified — verification only.

**Interfaces:** exercises every route and page produced by Tasks 4-9 together.

- [ ] **Step 1: Run the full unit test suite**

Run: `cd apps/frontend && npx vitest run`
Expected: all tests from Tasks 1-2 pass (12 assertions across category lookup, pagination, dedup filter, image mapping).

- [ ] **Step 2: Run typecheck and lint across the whole feature**

Run: `cd apps/frontend && npx tsc --noEmit && npm run lint`
Expected: no errors; no new lint warnings beyond the project's pre-existing baseline.

- [ ] **Step 3: Start the dev server**

Run: `cd apps/frontend && npm run dev`
Expected: server up at `localhost:3000`.

- [ ] **Step 4: Walk the import flow live (Playwright)**

Navigate to `/admin/assets`, click "Import from Printify →", click "Scan Printify". Expected: a table of ~11 unmatched products appears, matching this session's audit (Kiss-Cut Stickers, Cotton Canvas Tote Bag, alternate hoodie/shirt, 4 duplicate shirts), each with a pre-filled category except any genuinely unrecognized blueprint.

- [ ] **Step 5: Import one real product**

Pick the Kiss-Cut Stickers row (category should already show `sticker`), click Import. Expected: row disappears from the table; a new `assets` doc now exists in Firestore with `productCategory: 'sticker'`, `printifyStatus: 'published'`, `importSource: 'printify-import'`, and 12 `mockupImages`. Confirm it appears on `/shop` with its mockup image.

- [ ] **Step 6: Ignore one duplicate**

Pick one of the 4 duplicate "AI generated design" shirt rows, click Ignore. Expected: row disappears. Click "Scan Printify" again — expected: that same product does not reappear (confirms `printifyImportIgnores` is respected).

- [ ] **Step 7: Confirm Gallery exclusion**

Navigate to `/gallery`. Expected: the newly-imported Kiss-Cut Stickers product does not appear anywhere in the grid.

- [ ] **Step 8: Confirm the bundled bug fixes**

On `/admin/assets`, confirm the "Backfill All Mockups" button's enabled/disabled state now agrees with which assets actually have `mockupImages` (not just `mockupUrl`) — cross-check against the current Firestore data noted in project memory. If any tracked asset happens to have `mockupUrl` set but empty/missing `mockupImages`, click "Refresh Mockup" on it and confirm the UI now visibly updates with the new mockup image immediately (previously required a manual page reload).

- [ ] **Step 9: Final review**

Run `git log --oneline` to confirm all 9 prior commits are present on the branch. Do not push — per this project's deployment setup, pushing to `main` triggers an automatic Cloud Build → Cloud Run production deploy, and per this session's established pattern, that decision is the user's to make explicitly, separate from finishing implementation.
