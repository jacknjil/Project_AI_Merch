# Sprint 6A: Asset Published Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `published` toggle to assets so admins can hide n8n-generated assets from the customer gallery without deleting them.

**Architecture:** Client-side filter in `useAssets` treats missing/true `published` field as visible and `false` as hidden. A new `/admin/assets` page lets admins toggle per asset with optimistic UI. No new Firestore indexes — query is unchanged.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, React 19, Tailwind CSS v4, Firebase Firestore client SDK

---

## File Map

| File | Action |
|------|--------|
| `apps/frontend/src/lib/types.ts` | Modify — add `published?: boolean` to `Asset` |
| `apps/frontend/src/hooks/useAssets.ts` | Modify — `limit(count * 2)`, filter, slice |
| `apps/frontend/src/app/admin/assets/page.tsx` | Create — asset list with publish toggle |
| `apps/frontend/src/app/admin/products/page.tsx` | Modify — add "Assets →" nav link |

---

### Task 1: Add `published` to Asset type

**Files:**
- Modify: `apps/frontend/src/lib/types.ts`

- [ ] **Step 1: Add the field**

  Replace the `Asset` interface in `src/lib/types.ts`:

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
    published?: boolean; // undefined = visible (default for n8n assets)
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  Run from `apps/frontend/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no output (clean).

- [ ] **Step 3: Commit**

  ```bash
  git add apps/frontend/src/lib/types.ts
  git commit -m "feat: add published field to Asset type"
  ```

---

### Task 2: Update useAssets hook with published filter

**Files:**
- Modify: `apps/frontend/src/hooks/useAssets.ts`

- [ ] **Step 1: Replace the hook implementation**

  Replace the full file content:

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
            limit(count * 2), // fetch extra to account for hidden assets
          );
          const snap = await getDocs(q);
          const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Asset);
          setAssets(all.filter((a) => a.published !== false).slice(0, count));
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

- [ ] **Step 2: Verify TypeScript and lint**

  ```bash
  npx tsc --noEmit && npm run lint -- --max-warnings 999 2>&1 | grep useAssets
  ```
  Expected: no errors in `useAssets.ts`.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/frontend/src/hooks/useAssets.ts
  git commit -m "feat: filter published assets in useAssets hook"
  ```

---

### Task 3: Create /admin/assets page

**Files:**
- Create: `apps/frontend/src/app/admin/assets/page.tsx`

- [ ] **Step 1: Create the directory and file**

  ```bash
  mkdir -p apps/frontend/src/app/admin/assets
  ```

  Create `apps/frontend/src/app/admin/assets/page.tsx`:

  ```tsx
  'use client';

  import React, { useState, useEffect } from 'react';
  import Link from 'next/link';
  import Image from 'next/image';
  import {
    collection,
    getDocs,
    query,
    orderBy,
    doc,
    updateDoc,
  } from 'firebase/firestore';
  import { db } from '@/lib/firebase';
  import { Asset } from '@/lib/types';

  export default function AdminAssetsPage() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

    useEffect(() => {
      const load = async () => {
        try {
          setLoading(true);
          const q = query(collection(db, 'assets'), orderBy('createdAt', 'desc'));
          const snap = await getDocs(q);
          setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Asset));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load assets');
        } finally {
          setLoading(false);
        }
      };
      load();
    }, []);

    const toggle = async (asset: Asset) => {
      const isPublished = asset.published !== false;
      const newValue = !isPublished;

      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, published: newValue } : a)),
      );
      setRowErrors((prev) => ({ ...prev, [asset.id]: '' }));

      try {
        await updateDoc(doc(db, 'assets', asset.id), { published: newValue });
      } catch {
        setAssets((prev) =>
          prev.map((a) =>
            a.id === asset.id ? { ...a, published: asset.published } : a,
          ),
        );
        setRowErrors((prev) => ({
          ...prev,
          [asset.id]: 'Update failed. Try again.',
        }));
      }
    };

    if (loading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <p className="animate-pulse text-sm text-muted">Loading assets…</p>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-4xl">
          <header className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-primary">Assets</h1>
              <p className="text-sm text-muted">
                Toggle visibility in the customer gallery.
              </p>
            </div>
            <Link href="/admin/products" className="text-sm text-accent underline">
              ← Products
            </Link>
          </header>

          {error && (
            <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {!error && assets.length === 0 && (
            <p className="text-sm text-muted">No assets found.</p>
          )}

          <div className="flex flex-col gap-2">
            {assets.map((asset) => {
              const isPublished = asset.published !== false;
              return (
                <div
                  key={asset.id}
                  className="flex items-center gap-4 rounded-lg border border-white/10 bg-secondary p-3"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-background">
                    {asset.imageUrl ? (
                      <Image
                        src={asset.imageUrl}
                        alt={asset.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary">
                      {asset.title}
                    </p>
                    {asset.niche && (
                      <p className="text-xs text-muted">{asset.niche}</p>
                    )}
                    {rowErrors[asset.id] && (
                      <p className="text-xs text-red-400">{rowErrors[asset.id]}</p>
                    )}
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      isPublished
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-white/5 text-muted'
                    }`}
                  >
                    {isPublished ? 'Published' : 'Hidden'}
                  </span>

                  <button
                    onClick={() => toggle(asset)}
                    className={`shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                      isPublished
                        ? 'border-white/20 text-muted hover:border-red-500/50 hover:text-red-400'
                        : 'border-accent/30 text-accent hover:border-accent'
                    }`}
                  >
                    {isPublished ? 'Hide' : 'Publish'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript and lint**

  ```bash
  npx tsc --noEmit && npm run lint -- --max-warnings 999 2>&1 | grep -E "admin/assets|error"
  ```
  Expected: no errors in `admin/assets/page.tsx`.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/frontend/src/app/admin/assets/
  git commit -m "feat: add admin assets page with publish toggle"
  ```

---

### Task 4: Wire "Assets →" nav link into admin products page

**Files:**
- Modify: `apps/frontend/src/app/admin/products/page.tsx:104-118`

- [ ] **Step 1: Wrap the header actions in a flex group and add the Assets link**

  Find the header `<Link>` for `+ New product` (around line 104) and replace the single link with a pair:

  ```tsx
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Link
      href="/admin/assets"
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid #4b5563',
        background: '#111827',
        color: '#e5e7eb',
        fontSize: '0.85rem',
        textDecoration: 'none',
      }}
    >
      Assets →
    </Link>
    <Link
      href="/admin/products/new"
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid #10b981',
        background: '#022c22',
        color: '#a7f3d0',
        fontSize: '0.85rem',
        textDecoration: 'none',
      }}
    >
      + New product
    </Link>
  </div>
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no output (clean).

- [ ] **Step 3: Commit**

  ```bash
  git add apps/frontend/src/app/admin/products/page.tsx
  git commit -m "feat: add Assets nav link to admin products header"
  ```

---

## Manual Verification Checklist

After all tasks are committed, start the dev server (`npm run dev` from `apps/frontend/`) and confirm:

- [ ] `/studio/gallery` — only shows assets where `published !== false`. If all assets have no `published` field, all still appear (correct default).
- [ ] `/admin/assets` — lists all assets including hidden ones. Each row shows correct Published/Hidden chip.
- [ ] Clicking "Hide" on a published asset → chip turns gray "Hidden", button changes to "Publish", immediately (optimistic). Reload confirms Firestore was updated.
- [ ] Clicking "Publish" on a hidden asset → chip turns green, button changes to "Hide".
- [ ] After hiding an asset, visit `/studio/gallery` — hidden asset no longer appears.
- [ ] `/admin/products` — "Assets →" link appears in header and navigates to `/admin/assets`.
