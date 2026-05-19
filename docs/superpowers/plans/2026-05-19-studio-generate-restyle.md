# Studio Generate Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `/studio/generate` from raw inline-style HTML to the dark cyberpunk design system — two-column layout (controls left, results right), Tailwind v4 classes, existing `Button` and `Input` components — without touching any API or state logic.

**Architecture:** Single file conversion (`page.tsx` in-place). A minor update to `Input.tsx` fixes the hardcoded light border so the component works correctly on the dark background. Result cards use a raw `<article>` element (not `Card`) because `Card`'s defaults are light-theme and className can't reliably override them in Tailwind v4.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, TypeScript 5. All commands run from `apps/frontend/`.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/components/ui/Input.tsx` | Modify | `border-gray-200` → `border-white/20` (line 19) |
| `src/app/studio/generate/page.tsx` | Modify | Full restyle — all inline styles replaced with Tailwind classes |

No new files. No API routes touched. No state logic changed.

---

## CSS Variables Reference

Defined in `src/app/globals.css`:

```
--color-background: #0a0a0a   → bg-background, text-background
--color-primary:    #f0f0f0   → bg-primary, text-primary
--color-secondary:  #111111   → bg-secondary, text-secondary
--color-accent:     #00FF41   → bg-accent, text-accent (neon green)
--color-muted:      #9ca3af   → bg-muted, text-muted
```

The app Header is `sticky top-0 h-16` (64px = 4rem). The left panel uses `lg:top-16` to stick below it.

---

## Task 1: Fix Input Component Border for Dark Theme

**Files:**
- Modify: `src/components/ui/Input.tsx:19`

The `Input` component hardcodes `border-gray-200` (light gray). Since the app forces dark mode globally, update the default to `border-white/20` so `Input` works correctly everywhere without needing per-use overrides.

- [ ] **Step 1: Open the file and make the change**

In `src/components/ui/Input.tsx`, find line 19. Change only the border class:

```tsx
// Before
className={`flex h-10 w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}

// After
className={`flex h-10 w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
```

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors or warnings related to `Input.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Input.tsx
git commit -m "fix: update Input border to dark theme (border-white/20)"
```

---

## Task 2: Restyle /studio/generate Page

**Files:**
- Modify: `src/app/studio/generate/page.tsx`

Replace all inline styles with Tailwind classes. Keep all state, all handlers, and all API logic byte-for-byte identical. The only changes are in the JSX return and the import list.

- [ ] **Step 1: Replace the full file contents**

```tsx
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { PROMPT_TEMPLATES } from '@/lib/promptTemplates';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type GeneratedAsset = {
  id: string;
  title: string;
  niche: string;
  imageUrl: string;
};

export default function GenerateAssetPage() {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [niche, setNiche] = useState('');
  const [count, setCount] = useState<number>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        <h1 className="text-2xl font-black text-primary">Generate</h1>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 flex-col lg:flex-row">

        {/* LEFT: Control panel */}
        <aside className="w-full shrink-0 border-b border-white/5 p-6 lg:w-96 lg:self-start lg:sticky lg:top-16 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-white/10">
          {/* Tab-bar slot — add future tabs (Settings, History) here */}
          <div className="mb-6 border-b border-white/10">
            <span className="inline-block border-b-2 border-accent pb-2 text-sm font-semibold text-primary">
              Generate
            </span>
          </div>

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

            {/* Template selector */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Prompt Template</label>
              <select
                value={selectedTemplate}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedTemplate(id);
                  const tmpl = PROMPT_TEMPLATES.find((t) => t.id === id);
                  if (tmpl) {
                    setPrompt(
                      tmpl.build({
                        subject: 'a mountain',
                        animal: 'a fox',
                        character: 'a robot',
                        theme: 'a forest at sunset',
                      })
                    );
                  }
                }}
                className="flex h-10 w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <option value="" className="bg-secondary">-- Select Template --</option>
                {PROMPT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id} className="bg-secondary">
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

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
                placeholder="Describe the design(s) you want to generate…"
                className="flex w-full resize-none rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? `Generating ${count} image(s)…` : `Generate ${count} image(s)`}
            </Button>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </aside>

        {/* RIGHT: Results panel */}
        <section className="flex-1 p-6">
          {generatedAssets.length === 0 ? (
            /* Empty state — rendered on load so no layout shift when results arrive */
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
              <p className="text-sm font-medium text-primary">Your designs will appear here</p>
              <p className="text-xs text-muted">
                Choose a template or write a prompt, then hit Generate
              </p>
            </div>
          ) : (
            /* Results grid */
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
                    {/* Image with Saved badge */}
                    <div className="relative aspect-square overflow-hidden bg-background">
                      <Image
                        src={asset.imageUrl}
                        alt={asset.title}
                        fill
                        className="object-cover"
                      />
                      <span className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium text-accent">
                        Saved ✓
                      </span>
                    </div>
                    {/* Card info */}
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-primary">{asset.title}</p>
                      {asset.niche && (
                        <p className="mt-0.5 text-xs text-muted">{asset.niche}</p>
                      )}
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

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors. The `@typescript-eslint/no-explicit-any` suppression comments from the old file are removed — the new version uses `err: unknown` with a proper type guard, which is cleaner.

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/studio/generate/page.tsx
git commit -m "feat: restyle /studio/generate with dark cyberpunk theme and two-column layout"
```

---

## Task 3: Verification

**Files:** none modified

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: server starts at `http://localhost:3000` with no compilation errors.

- [ ] **Step 2: Visual check — empty state**

Open `http://localhost:3000/studio/generate`.

Verify:
- Page header shows "AI Studio" label (accent green) + "Generate" h1 (white)
- Left panel is visible with all 5 controls (Title, Niche, Template, Count, Prompt)
- "Generate" tab underlined in green
- Right panel shows the sparkle empty state ("Your designs will appear here")
- On a narrow viewport (< 1024px), the layout stacks vertically

- [ ] **Step 3: Visual check — results grid**

Fill in the Prompt field with any text (e.g. "a glowing fox") and click Generate.

> **Note:** This will call the real OpenAI API if `OPENAI_API_KEY` is set in `.env.local`. If not configured, the API will error — that is expected and acceptable for this visual check. The error message should appear in red below the Generate button (not a white flash or broken layout).

If the API is configured and generation succeeds, verify:
- Results appear in the right panel (no layout shift)
- Each card shows the image (1:1 aspect), title, niche tag
- "Saved ✓" badge appears in the top-right of each image
- Grid is 2-column, expanding to 3-column at xl width

- [ ] **Step 4: Production build**

Stop the dev server and run:

```bash
npm run build
```

Expected: build completes successfully, `Route /studio/generate` appears in output with no errors.

- [ ] **Step 5: Final commit (if any fixes were needed)**

If step 2, 3, or 4 required fixes, commit them:

```bash
git add src/app/studio/generate/page.tsx src/components/ui/Input.tsx
git commit -m "fix: studio generate restyle visual corrections"
```

If no fixes were needed, skip this step.
