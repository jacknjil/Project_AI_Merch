# Sprint 6B — Prompt Remix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click "Remix Prompt →" on a gallery asset and land on a pre-filled generate-style page where they can edit and re-run the prompt to produce variations.

**Architecture:** Two-file change. The gallery page gets a second action button. A new self-contained `/studio/remix` page mirrors the two-column layout of `/studio/generate` — source asset thumbnail + editable fields on the left, generated results on the right. No new API routes, hooks, or types needed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS v4, Firebase (client SDK), existing `Button` / `Input` components from `src/components/ui/`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/app/studio/gallery/page.tsx` | Modify | Add "Remix Prompt →" button alongside "Use This Art →" |
| `src/app/studio/remix/page.tsx` | Create | Self-contained remix page — asset fetch, pre-fill, generate, results |

---

## Task 1: Gallery — Add "Remix Prompt →" button

**Files:**
- Modify: `src/app/studio/gallery/page.tsx`

The current bottom action is a single full-width `<Button>`. Replace it with a `flex gap-3` row containing two `flex-1` buttons.

- [ ] **Step 1: Replace the single button with a two-button row**

In `src/app/studio/gallery/page.tsx`, find the existing `<Button>` block (around line 99–110):

```tsx
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
```

Replace it with:

```tsx
            <div className="flex gap-3">
              <Button
                variant="primary"
                size="lg"
                disabled={!selected}
                onClick={() =>
                  selected && router.push(`/studio/apply?assetId=${selected.id}`)
                }
                className="flex-1"
              >
                Use This Art →
              </Button>
              <Button
                variant="outline"
                size="lg"
                disabled={!selected}
                onClick={() =>
                  selected && router.push(`/studio/remix?assetId=${selected.id}`)
                }
                className="flex-1"
              >
                Remix Prompt →
              </Button>
            </div>
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run from `apps/frontend/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify lint passes**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/studio/gallery/page.tsx
git commit -m "feat: add Remix Prompt button to gallery"
```

---

## Task 2: Create `/studio/remix` page

**Files:**
- Create: `src/app/studio/remix/page.tsx`

This page is self-contained. It reads `assetId` from the URL, fetches the asset, pre-fills controls, and generates new images via `/api/generate-asset` — same pattern as `/studio/generate`.

- [ ] **Step 1: Create the file with the full page component**

Create `apps/frontend/src/app/studio/remix/page.tsx`:

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAsset } from '@/hooks/useAssets';
import { Asset } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type GeneratedAsset = {
  id: string;
  title: string;
  niche: string;
  imageUrl: string;
};

export default function RemixPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assetId = searchParams.get('assetId');

  const [source, setSource] = useState<Asset | null>(null);
  const [loadingSource, setLoadingSource] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [niche, setNiche] = useState('');
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState<number>(1);

  const [loading, setLoading] = useState(false);
  const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) {
      router.replace('/studio/gallery');
      return;
    }

    async function load() {
      setLoadingSource(true);
      const asset = await getAsset(assetId!);
      if (!asset) {
        setSourceError('Asset not found');
      } else {
        setSource(asset);
        setTitle(asset.title ?? '');
        setNiche(asset.niche ?? '');
        setPrompt(asset.prompt ?? '');
      }
      setLoadingSource(false);
    }

    load();
  }, [assetId, router]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }
    setError(null);
    setLoading(true);
    setGeneratedAssets([]);

    try {
      const res = await fetch('/api/generate-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          title: title || prompt.slice(0, 60),
          niche: niche || 'general',
          count,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Generation failed');
      }

      const data = await res.json();
      setGeneratedAssets(data.assets ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* Page header */}
      <div className="border-b border-white/5 px-6 py-4">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">AI Studio</p>
        <h1 className="text-2xl font-black text-primary">Remix</h1>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 flex-col lg:flex-row">

        {/* LEFT: Control panel */}
        <aside className="w-full shrink-0 border-b border-white/5 p-6 lg:w-96 lg:self-start lg:sticky lg:top-16 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-white/10">
          <div className="mb-6 border-b border-white/10">
            <span className="inline-block border-b-2 border-accent pb-2 text-sm font-semibold text-primary">
              Remix
            </span>
          </div>

          {/* Source asset: loading skeleton */}
          {loadingSource && (
            <div className="mb-6 flex flex-col gap-3">
              <div className="aspect-square w-full animate-pulse rounded-lg bg-secondary" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
              <div className="mt-2 border-t border-white/10" />
            </div>
          )}

          {/* Source asset: error */}
          {!loadingSource && sourceError && (
            <div className="mb-6 flex flex-col gap-2">
              <p className="text-sm text-red-400">{sourceError}</p>
              <Link href="/studio/gallery" className="text-xs text-accent hover:underline">
                ← Back to Gallery
              </Link>
            </div>
          )}

          {/* Source asset: thumbnail */}
          {!loadingSource && source && (
            <div className="mb-6">
              <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-white/10 bg-background">
                <Image src={source.imageUrl} alt={source.title} fill className="object-cover" />
              </div>
              <p className="mt-2 truncate text-xs text-muted">{source.title}</p>
              <div className="mt-4 border-t border-white/10" />
            </div>
          )}

          <div className="flex flex-col gap-5">
            <Input
              label="Title"
              placeholder="Name your design…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <Input
              label="Niche"
              placeholder="e.g. 80s-retro, kawaii-animals"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />

            {/* Count */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Number of images</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={count}
                  onChange={(e) =>
                    setCount(Math.min(8, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="h-10 w-20 rounded-md border border-white/20 bg-transparent px-3 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <span className="text-xs text-muted">1–8 images</span>
              </div>
            </div>

            {/* Prompt */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder="No original prompt — write your own."
                className="flex w-full resize-none rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || loadingSource || !!sourceError}
              variant="primary"
              className="w-full"
              size="lg"
            >
              {loading ? `Generating ${count} image(s)…` : 'Generate Remix'}
            </Button>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </aside>

        {/* RIGHT: Results panel */}
        <section className="flex-1 p-6">
          {generatedAssets.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
              <svg
                className="h-10 w-10 text-accent/40"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
              <p className="text-sm font-medium text-primary">Your remixed designs will appear here</p>
              <p className="text-xs text-muted">Edit the prompt and hit Generate Remix</p>
            </div>
          ) : (
            <div>
              <p className="mb-4 text-sm text-muted">
                {generatedAssets.length} design{generatedAssets.length !== 1 ? 's' : ''} generated
              </p>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {generatedAssets.map((asset) => (
                  <article
                    key={asset.id}
                    className="overflow-hidden rounded-lg border border-white/10 bg-secondary"
                  >
                    <div className="relative aspect-square overflow-hidden bg-background">
                      <Image src={asset.imageUrl} alt={asset.title} fill className="object-cover" />
                      <span className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium text-accent">
                        Saved ✓
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-primary">{asset.title}</p>
                      {asset.niche && (
                        <p className="mt-0.5 text-xs text-muted">{asset.niche}</p>
                      )}
                      <Link
                        href={`/studio/apply?assetId=${asset.id}`}
                        className="mt-2 block w-full rounded-md bg-accent/10 px-3 py-1.5 text-center text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
                      >
                        Apply to Product →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run from `apps/frontend/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify lint passes**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/studio/remix/page.tsx
git commit -m "feat: add /studio/remix page for prompt remixing"
```

---

## Task 3: Manual verification

- [ ] **Step 1: Start the dev server**

From `apps/frontend/`:
```bash
npm run dev
```
Navigate to `http://localhost:3000`.

- [ ] **Step 2: Verify gallery button layout**

Go to `/studio/gallery`. Before selecting an asset: both buttons should be visible but disabled (grayed out). Select an asset: both buttons enable. Confirm "Use This Art →" still navigates to `/studio/apply?assetId=X` as before.

- [ ] **Step 3: Verify remix page — navigation and redirect**

Click "Remix Prompt →" on a selected gallery asset. Confirm you land on `/studio/remix?assetId=<id>`. Then navigate directly to `/studio/remix` (no query param) — confirm it redirects immediately to `/studio/gallery`.

- [ ] **Step 4: Verify remix page — pre-fill and layout**

On the remix page: confirm the source asset thumbnail is visible on the left. Confirm Title, Niche, and Prompt are pre-filled from the asset. Confirm Number of images defaults to 1. Confirm "Generate Remix" button is disabled while the asset is loading, then enables once loaded.

- [ ] **Step 5: Verify remix page — asset not found**

Navigate to `/studio/remix?assetId=nonexistent-id`. Confirm the error state appears ("Asset not found") with a back link to the gallery.

- [ ] **Step 6: Final commit if any fixes were made during verification**

```bash
git add -p
git commit -m "fix: address issues found during remix manual verification"
```

Skip this step if no fixes were needed.
