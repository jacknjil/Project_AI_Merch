# Printify Deletion → Firestore Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin manually scan for Firestore `assets` docs whose `printifyProductId` no longer resolves on live Printify (deleted directly in Printify's dashboard), archive them so they stop appearing on `/shop`, and restore them if archived by mistake — while bundling a bug fix in `admin/assets/page.tsx` that this feature's archived state would otherwise trigger.

**Architecture:** One new pure function (`findOrphanedAssets`) in `src/lib/printify.ts`, alongside the existing `fetchAllPrintifyProducts`/`filterUnmatchedProducts` it composes with. Two new server-only Next.js API routes (`preview`, `archive`) plus a `restore` route. A new `/admin/printify-reconcile` review page drives scan + archive. Restore lives on the existing `/admin/assets` page, which already lists every asset unfiltered.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Firebase Admin SDK (Firestore), Printify REST API, Vitest (already installed and configured from the sibling import feature — pure-logic unit tests only), manual Playwright verification for routes/UI (matches this project's existing convention; no `@playwright/test` package is installed, no Firestore emulator configured).

## Global Constraints

- All new API routes use `export const runtime = 'nodejs';` and the `adminDb` / `FieldValue` exports from `src/lib/firebaseAdmin.ts` — same pattern as `src/app/api/printify-import/*/route.ts`.
- No new auth gate on `/admin/*` — consistent with every existing admin route/page today.
- Test strategy (matches the sibling `printify-import` plan's established precedent, verified still current: no Firestore emulator or `@playwright/test` package exists in this repo): Vitest for pure logic only (`findOrphanedAssets`). Route handlers and UI are verified manually via `tsc --noEmit`, `npm run lint`, and live Playwright browser checks against the local dev server — no new test-framework infra for those.
- Firestore field naming: `printifyStatus` (existing field, new value `'archived'`), `archivedAt` (new field) — both on the existing `assets` collection, no new collection.
- Do not modify `/shop/page.tsx` or `/shop/[productId]/page.tsx` — the spec confirms `printifyStatus: 'archived'` is automatically excluded by `/shop`'s existing query with zero changes needed there.
- Lint baseline before this feature: 21 problems (12 errors, 9 warnings), all pre-existing and unrelated to any file this plan touches (confirmed via `npm run lint` before starting).

---

### Task 1: `findOrphanedAssets` pure function + tests

**Files:**
- Modify: `apps/frontend/src/lib/printify.ts`
- Modify: `apps/frontend/src/lib/printify.test.ts`

**Interfaces:**
- Consumes: none new (standalone pure function, same style as the existing `filterUnmatchedProducts`).
- Produces: `AssetProductRef` (interface), `findOrphanedAssets(assets: AssetProductRef[], livePrintifyProductIds: Set<string>): AssetProductRef[]` — both exported from `src/lib/printify.ts`. Task 3 (preview route) consumes both.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/lib/printify.test.ts`, replace line 2:

```ts
import { suggestCategoryForBlueprint, fetchAllPrintifyProducts, filterUnmatchedProducts, mapPrintifyImages } from './printify';
```

with:

```ts
import { suggestCategoryForBlueprint, fetchAllPrintifyProducts, filterUnmatchedProducts, mapPrintifyImages, findOrphanedAssets, type AssetProductRef } from './printify';
```

Then append to the end of the file:

```ts

describe('findOrphanedAssets', () => {
  const assets: AssetProductRef[] = [
    { id: '1', title: 'Still live', printifyProductId: 'p1', printifyStatus: 'published' },
    { id: '2', title: 'Deleted on Printify', printifyProductId: 'p2', printifyStatus: 'published' },
    { id: '3', title: 'Never published', printifyProductId: undefined, printifyStatus: undefined },
    { id: '4', title: 'Already archived', printifyProductId: 'p4', printifyStatus: 'archived' },
  ];
  const liveIds = new Set(['p1']);

  it('flags assets whose printifyProductId is missing from the live Printify list', () => {
    const result = findOrphanedAssets(assets, liveIds);
    expect(result.map((a) => a.id)).toEqual(['2']);
  });

  it('excludes assets with no printifyProductId', () => {
    const result = findOrphanedAssets(assets, liveIds);
    expect(result.find((a) => a.id === '3')).toBeUndefined();
  });

  it('excludes assets already marked archived, even if missing from the live list', () => {
    const result = findOrphanedAssets(assets, liveIds);
    expect(result.find((a) => a.id === '4')).toBeUndefined();
  });

  it('returns an empty array when every tracked asset is still live', () => {
    const result = findOrphanedAssets(
      [{ id: '1', title: 'Live', printifyProductId: 'p1', printifyStatus: 'published' }],
      new Set(['p1']),
    );
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/printify.test.ts`
Expected: FAIL — `findOrphanedAssets` is not exported / not a function.

- [ ] **Step 3: Implement the function**

In `apps/frontend/src/lib/printify.ts`, add after the `filterUnmatchedProducts` function (after line 93, before `mapPrintifyImages`):

```ts
export interface AssetProductRef {
  id: string;
  title: string;
  printifyProductId?: string;
  printifyStatus?: string;
  mockupUrl?: string | null;
}

export function findOrphanedAssets(
  assets: AssetProductRef[],
  livePrintifyProductIds: Set<string>,
): AssetProductRef[] {
  return assets.filter(
    (a) =>
      !!a.printifyProductId &&
      a.printifyStatus !== 'archived' &&
      !livePrintifyProductIds.has(a.printifyProductId),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/printify.test.ts`
Expected: PASS — all tests, including the 4 new `findOrphanedAssets` assertions, green.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/printify.ts apps/frontend/src/lib/printify.test.ts
git commit -m "feat: add findOrphanedAssets for Printify-deletion reconciliation"
```

---

### Task 2: `Asset.archivedAt` field

**Files:**
- Modify: `apps/frontend/src/lib/types.ts`

**Interfaces:**
- Produces: `Asset.archivedAt?: number` — consumed by Task 4 (archive route writes it) and Task 5 (restore route clears it).

- [ ] **Step 1: Add the field**

In `apps/frontend/src/lib/types.ts`, in the `Asset` interface, add after `importSource?: 'printify-import';` (the last field, line 36):

```ts
  archivedAt?: number;
```

(Typed as `number`, matching this interface's existing convention for `createdAt?: number;` — both are Firestore `Timestamp` values on write, read back the same imprecise way elsewhere in this codebase. Not introducing a new typing pattern.)

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/types.ts
git commit -m "feat: add archivedAt field to Asset type"
```

---

### Task 3: `GET /api/printify-reconcile/preview` route

**Files:**
- Create: `apps/frontend/src/app/api/printify-reconcile/preview/route.ts`

**Interfaces:**
- Consumes: `fetchAllPrintifyProducts`, `findOrphanedAssets`, `type PrintifyProductSummary`, `type AssetProductRef` from `src/lib/printify.ts` (Task 1); `adminDb` from `src/lib/firebaseAdmin.ts`.
- Produces: `GET /api/printify-reconcile/preview` → `{ orphans: ReconcilePreviewItem[] }` where `ReconcilePreviewItem = { assetId: string; title: string; printifyProductId: string; mockupUrl: string | null }`. Consumed by Task 6 (admin UI).

- [ ] **Step 1: Implement the route**

Create `apps/frontend/src/app/api/printify-reconcile/preview/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  fetchAllPrintifyProducts,
  findOrphanedAssets,
  type PrintifyProductSummary,
  type AssetProductRef,
} from '@/lib/printify';

export const runtime = 'nodejs';

const PRINTIFY_BASE = 'https://api.printify.com/v1';

export interface ReconcilePreviewItem {
  assetId: string;
  title: string;
  printifyProductId: string;
  mockupUrl: string | null;
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
    const livePrintifyProductIds = new Set(products.map((p) => p.id));

    const assetsSnap = await adminDb
      .collection('assets')
      .select('title', 'printifyProductId', 'printifyStatus', 'mockupUrl')
      .get();

    const assets: AssetProductRef[] = assetsSnap.docs.map((d) => ({
      id: d.id,
      title: (d.get('title') as string | undefined) ?? '',
      printifyProductId: d.get('printifyProductId') as string | undefined,
      printifyStatus: d.get('printifyStatus') as string | undefined,
      mockupUrl: (d.get('mockupUrl') as string | undefined) ?? null,
    }));

    const orphans = findOrphanedAssets(assets, livePrintifyProductIds);

    const items: ReconcilePreviewItem[] = orphans.map((a) => ({
      assetId: a.id,
      title: a.title,
      printifyProductId: a.printifyProductId as string,
      mockupUrl: a.mockupUrl ?? null,
    }));

    return NextResponse.json({ orphans: items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-reconcile/preview error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify against live Printify/Firestore (read-only, safe)**

Run: `cd apps/frontend && npm run dev` (in one terminal), then in another:
`curl -s http://localhost:3000/api/printify-reconcile/preview | python3 -m json.tool`

Expected: a JSON object with an `orphans` array. If nothing has been deleted on Printify since the last import/publish, this should be `[]` — that is the expected, correct result today; it confirms the route runs without error rather than indicating a bug.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/api/printify-reconcile/preview/route.ts
git commit -m "feat: add Printify reconcile preview API route"
```

---

### Task 4: `POST /api/printify-reconcile/archive` route

**Files:**
- Create: `apps/frontend/src/app/api/printify-reconcile/archive/route.ts`

**Interfaces:**
- Consumes: `adminDb`, `FieldValue` from `src/lib/firebaseAdmin.ts`.
- Produces: `POST /api/printify-reconcile/archive` — body `{ assetId: string }` → `{ success: true }` on success, `{ error: string }` with 400/500 on failure. Consumed by Task 6 (admin UI). Writes `printifyStatus: 'archived'` and `archivedAt` (Task 2's field) onto the `assets/{assetId}` doc.

- [ ] **Step 1: Implement the route**

Create `apps/frontend/src/app/api/printify-reconcile/archive/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { assetId } = body ?? {};

    if (!assetId) {
      return NextResponse.json(
        { error: 'Missing required field: assetId' },
        { status: 400 },
      );
    }

    const ref = adminDb.collection('assets').doc(String(assetId));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: `Asset not found: ${assetId}` }, { status: 400 });
    }

    await ref.set(
      { printifyStatus: 'archived', archivedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-reconcile/archive error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/api/printify-reconcile/archive/route.ts
git commit -m "feat: add Printify reconcile archive API route"
```

*(Functional verification — actually archiving a real asset — happens in Task 8's end-to-end pass, not here, to avoid mutating production Firestore mid-task.)*

---

### Task 5: `POST /api/printify-reconcile/restore` route

**Files:**
- Create: `apps/frontend/src/app/api/printify-reconcile/restore/route.ts`

**Interfaces:**
- Consumes: `adminDb`, `FieldValue` from `src/lib/firebaseAdmin.ts`.
- Produces: `POST /api/printify-reconcile/restore` — body `{ assetId: string }` → `{ success: true }` on success, `{ error: string }` with 400/500 on failure. Consumed by Task 7 (admin/assets Restore button). Resets `printifyStatus` to `'published'` and clears `archivedAt` on the `assets/{assetId}` doc.

- [ ] **Step 1: Implement the route**

Create `apps/frontend/src/app/api/printify-reconcile/restore/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { assetId } = body ?? {};

    if (!assetId) {
      return NextResponse.json(
        { error: 'Missing required field: assetId' },
        { status: 400 },
      );
    }

    const ref = adminDb.collection('assets').doc(String(assetId));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: `Asset not found: ${assetId}` }, { status: 400 });
    }

    await ref.set(
      { printifyStatus: 'published', archivedAt: FieldValue.delete() },
      { merge: true },
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-reconcile/restore error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/api/printify-reconcile/restore/route.ts
git commit -m "feat: add Printify reconcile restore API route"
```

---

### Task 6: `/admin/printify-reconcile` review page

**Files:**
- Create: `apps/frontend/src/app/admin/printify-reconcile/page.tsx`

**Interfaces:**
- Consumes: `GET /api/printify-reconcile/preview` (Task 3), `POST /api/printify-reconcile/archive` (Task 4).
- Produces: the `/admin/printify-reconcile` route, linked from `admin/assets/page.tsx` in Task 7.

- [ ] **Step 1: Implement the page**

Create `apps/frontend/src/app/admin/printify-reconcile/page.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface PreviewItem {
  assetId: string;
  title: string;
  printifyProductId: string;
  mockupUrl: string | null;
}

export default function PrintifyReconcilePage() {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const scan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/printify-reconcile/preview');
      const data = (await res.json()) as { error?: string; orphans?: PreviewItem[] };
      if (!res.ok) throw new Error(data.error ?? 'Scan failed');
      setItems(data.orphans ?? []);
      setScanned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  };

  const archiveRow = async (item: PreviewItem) => {
    setArchivingId(item.assetId);
    setRowErrors((prev) => ({ ...prev, [item.assetId]: '' }));
    try {
      const res = await fetch('/api/printify-reconcile/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: item.assetId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Archive failed');
      setItems((prev) => prev.filter((p) => p.assetId !== item.assetId));
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [item.assetId]: err instanceof Error ? err.message : 'Archive failed',
      }));
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/assets" className="text-sm text-accent underline">
          ← Back to Assets
        </Link>
        <h1 className="mt-2 text-2xl font-black text-primary">Reconcile Printify Deletions</h1>
        <p className="mb-4 text-sm text-muted">
          Finds assets whose Printify product no longer exists (deleted directly on Printify).
        </p>

        <button
          onClick={scan}
          disabled={loading}
          className="rounded-md border border-sky-500/30 px-3 py-1 text-xs font-medium text-sky-400 transition-colors hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Scanning…' : 'Scan for removed products'}
        </button>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {scanned && items.length === 0 && !error && (
          <p className="mt-4 text-sm text-muted">No removed products found.</p>
        )}

        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <div
              key={item.assetId}
              className="flex flex-wrap items-center gap-4 border-b border-white/10 pb-4"
            >
              {item.mockupUrl && (
                <Image
                  src={item.mockupUrl}
                  alt={item.title}
                  width={80}
                  height={80}
                  className="rounded-md object-cover"
                />
              )}
              <div className="min-w-[180px] flex-1">
                <div className="font-medium">{item.title}</div>
                <div className="text-xs text-muted">Printify ID {item.printifyProductId}</div>
              </div>
              <button
                onClick={() => archiveRow(item)}
                disabled={archivingId === item.assetId}
                className="rounded-md border border-red-500/30 px-3 py-1 text-xs font-medium text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {archivingId === item.assetId ? 'Archiving…' : 'Archive'}
              </button>
              {rowErrors[item.assetId] && (
                <p className="w-full text-xs text-red-400">{rowErrors[item.assetId]}</p>
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
git add apps/frontend/src/app/admin/printify-reconcile/page.tsx
git commit -m "feat: add Printify reconcile review page"
```

*(Full interactive verification — scan, archive — happens in Task 8 alongside the admin/assets link and Restore button added in Task 7.)*

---

### Task 7: Restore action, archived-state guard, and link in `admin/assets/page.tsx`

**Files:**
- Modify: `apps/frontend/src/app/admin/assets/page.tsx`

**Interfaces:**
- Consumes: `POST /api/printify-reconcile/restore` (Task 5); `/admin/printify-reconcile` (Task 6).
- Produces: no new exports; fixes the bug where an archived row would otherwise show a "Publish to Printify" button and risk creating a duplicate Printify product.

- [ ] **Step 1: Add `restoringId` state**

In `apps/frontend/src/app/admin/assets/page.tsx`, line 23, replace:

```ts
  const [refreshingMockupId, setRefreshingMockupId] = useState<string | null>(null);
```

with:

```ts
  const [refreshingMockupId, setRefreshingMockupId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
```

- [ ] **Step 2: Add the `restore` handler**

After the `refreshMockup` function (after line 101, the `};` that closes it, and before the blank line preceding `backfillAllMockups`), insert:

```ts

  const restore = async (asset: Asset) => {
    setRestoringId(asset.id);
    setRowErrors((prev) => ({ ...prev, [asset.id]: '' }));
    try {
      const res = await fetch('/api/printify-reconcile/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Restore failed');
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id ? { ...a, printifyStatus: 'published', archivedAt: undefined } : a,
        ),
      );
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [asset.id]: err instanceof Error ? err.message : 'Restore failed',
      }));
    } finally {
      setRestoringId(null);
    }
  };
```

- [ ] **Step 3: Guard the Publish button against the `archived` status and add the Restore UI**

Lines 277-289, replace:

```tsx
                {asset.printifyStatus === 'published' ? (
                  <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">
                    On Etsy
                  </span>
                ) : (
                  <button
                    onClick={() => publishToPrintify(asset)}
                    disabled={publishingId === asset.id || !asset.imageUrl}
                    className="shrink-0 rounded-md border border-violet-500/30 px-3 py-1 text-xs font-medium text-violet-400 transition-colors hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {publishingId === asset.id ? 'Publishing…' : 'Publish to Printify'}
                  </button>
                )}
```

with:

```tsx
                {asset.printifyStatus === 'published' ? (
                  <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">
                    On Etsy
                  </span>
                ) : asset.printifyStatus === 'archived' ? (
                  <>
                    <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-muted">
                      Archived
                    </span>
                    <button
                      onClick={() => restore(asset)}
                      disabled={restoringId === asset.id}
                      className="shrink-0 rounded-md border border-white/20 px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {restoringId === asset.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => publishToPrintify(asset)}
                    disabled={publishingId === asset.id || !asset.imageUrl}
                    className="shrink-0 rounded-md border border-violet-500/30 px-3 py-1 text-xs font-medium text-violet-400 transition-colors hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {publishingId === asset.id ? 'Publishing…' : 'Publish to Printify'}
                  </button>
                )}
```

- [ ] **Step 4: Add the "Reconcile Deletions" link**

Lines 202-204, replace:

```tsx
            <Link href="/admin/printify-import" className="text-sm text-accent underline">
              Import from Printify →
            </Link>
            <Link href="/admin/products" className="text-sm text-accent underline">
              ← Products
            </Link>
```

with:

```tsx
            <Link href="/admin/printify-import" className="text-sm text-accent underline">
              Import from Printify →
            </Link>
            <Link href="/admin/printify-reconcile" className="text-sm text-accent underline">
              Reconcile Deletions →
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
Expected: 21 problems (12 errors, 9 warnings) — same pre-existing baseline noted in Global Constraints, no new errors/warnings from this file.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/app/admin/assets/page.tsx
git commit -m "feat: add Restore action and archived-status guard; link Printify reconcile page"
```

---

### Task 8: End-to-end verification and whole-feature review

**Files:** none created or modified — verification only.

**Interfaces:** exercises every route and page produced by Tasks 3-7 together.

- [ ] **Step 1: Run the full unit test suite**

Run: `cd apps/frontend && npx vitest run`
Expected: all tests pass, including this feature's 4 new `findOrphanedAssets` assertions alongside the sibling import feature's existing 12.

- [ ] **Step 2: Run typecheck and lint across the whole feature**

Run: `cd apps/frontend && npx tsc --noEmit && npm run lint`
Expected: no type errors; lint at the same 21-problem baseline as before this feature (Global Constraints).

- [ ] **Step 3: Start the dev server**

Run: `cd apps/frontend && npm run dev`
Expected: server up at `localhost:3000`.

- [ ] **Step 4: Confirm the scan finds nothing when nothing was deleted (Playwright)**

Navigate to `/admin/assets`, click "Reconcile Deletions →", click "Scan for removed products". Expected: "No removed products found." (baseline — nothing has been deleted on Printify since this feature was designed).

- [ ] **Step 5: Manually delete one test product on Printify, then confirm detection**

In Printify's own dashboard, delete one product that is currently tracked in Firestore (pick a low-stakes one — check `/admin/assets` first for a candidate; do not delete a product with existing paid orders referencing it in `/admin/orders`, to keep this test's blast radius minimal even though Task 3's design already confirmed orders don't depend on live `assets` docs). Return to `/admin/printify-reconcile`, click "Scan for removed products" again. Expected: exactly one row appears, matching the deleted product's title and Printify ID.

- [ ] **Step 6: Archive it and confirm it disappears from `/shop`**

Click "Archive" on that row. Expected: row disappears from the reconcile table. Navigate to `/shop` — expected: that product no longer appears. Navigate to `/admin/assets` — expected: the row now shows an "Archived" badge and a "Restore" button, not "Publish to Printify".

- [ ] **Step 7: Restore it and confirm it reappears**

On `/admin/assets`, click "Restore" on the archived row. Expected: badge reverts to "On Etsy" (or the "Publish to Printify" button if `printifyProductId` was somehow cleared — it should not be, so "On Etsy" is the expected outcome). Navigate to `/shop` — expected: the product is visible again (its Printify product no longer exists, so any live-mockup-refresh action on it would fail, but this restore step only concerns Firestore visibility, not Printify state — that data loss on Printify's side is the source problem this feature detects, not something this feature can undo).

- [ ] **Step 8: Re-archive it to leave the repo state consistent with reality**

Since step 5's manual deletion was real and permanent on Printify, click "Archive" on that same row one more time via `/admin/printify-reconcile` (or directly via "Restore" being undone — simplest is: scan again, Archive the row) so the Firestore doc's state matches the fact that the underlying Printify product is genuinely gone. Confirm via `/admin/assets` that it shows "Archived" again.

- [ ] **Step 9: Final review**

Run `git log --oneline` to confirm all commits from Tasks 1-7 are present on the branch. Do not push — per this project's deployment setup, pushing to `main` triggers an automatic Cloud Build → Cloud Run production deploy, and per this project's established pattern, that decision is the user's to make explicitly, separate from finishing implementation.
