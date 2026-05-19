# Homepage Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BentoGrid placeholder homepage with a 5-section Alternating Lanes layout giving equal weight to Shop and Create.

**Architecture:** All homepage sections live inline in `src/app/page.tsx` — no sub-components (YAGNI). The Header gets a standalone dark theme fix. Product cards are hardcoded placeholder data; no Firebase reads in this plan.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS v4

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/layout/Header.tsx` | Modify | Dark theme — background, border, logo color, nav links |
| `src/app/page.tsx` | Full rewrite | 5-section homepage layout |
| `src/components/BentoGrid.tsx` | No change | Kept, unused on homepage |

**All commands run from `apps/frontend/`.**

---

### Task 1: Fix Header Dark Theme

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Replace the full Header component**

```tsx
'use client';

import Link from 'next/link';
import { Button } from '../ui/Button';
import { useCart } from '@/context/CartContext';

export function Header() {
  const { cartCount, setIsOpen } = useCart();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-secondary/90 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl font-bold font-heading tracking-widest text-accent">
            AI MERCH
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/products" className="text-muted transition-colors hover:text-primary">
            Shop
          </Link>
          <Link href="/studio/generate" className="text-muted transition-colors hover:text-primary">
            Studio
          </Link>
          <Link href="/gallery" className="text-muted transition-colors hover:text-primary">
            Gallery
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm">
            Sign In
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsOpen(true)}>
            Cart ({cartCount})
          </Button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Lint and build**

```bash
npm run lint && npm run build
```

Expected: No lint errors. Build completes (30 routes, zero TypeScript errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Header.tsx
git commit -m "fix: update Header to dark cyberpunk theme"
```

---

### Task 2: Homepage Shell + Hero Section

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace entire page.tsx with the Hero section**

```tsx
import Link from 'next/link';

export default function Home() {
  return (
    <div className="w-full">

      {/* ── 1. HERO ─────────────────────────────────────────── */}
      <section className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,rgba(0,255,65,0.06),transparent_70%)]" />
        <div className="relative">
          <p className="mb-4 text-xs tracking-[0.4em] text-accent uppercase">
            AI-Powered Merch Studio
          </p>
          <h1 className="mb-4 text-5xl font-black leading-tight text-primary">
            Your Art.<br />Your Merch.
          </h1>
          <p className="mx-auto mb-8 max-w-md text-sm text-muted">
            Generate custom AI artwork and wear it. Every piece is one of a kind.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/products"
              className="rounded border border-white/20 px-6 py-2.5 text-sm text-muted transition-colors hover:border-white/40 hover:text-primary"
            >
              Browse Shop
            </Link>
            <Link
              href="/studio/generate"
              className="rounded bg-accent px-6 py-2.5 text-sm font-bold text-black transition-colors hover:opacity-90"
            >
              Start Creating →
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
```

- [ ] **Step 2: Lint and build**

```bash
npm run lint && npm run build
```

Expected: No errors.

- [ ] **Step 3: Visual check**

```bash
npm run dev
```

Open http://localhost:3000. Verify: dark background with subtle green radial glow, green eyebrow text, large heading, ghost outline button beside solid green button. No BentoGrid.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: homepage hero section, remove BentoGrid placeholder"
```

---

### Task 3: Featured Products Section

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add Featured Products after the Hero `</section>`, before the closing `</div>`**

```tsx
      {/* ── 2. FEATURED PRODUCTS ─────────────────────────────── */}
      <section className="border-t border-white/5 bg-secondary px-6 py-14">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-baseline justify-between">
            <div>
              <p className="mb-1 text-xs tracking-[0.3em] text-accent uppercase">Shop</p>
              <h2 className="text-2xl font-bold text-primary">Featured Products</h2>
            </div>
            <Link
              href="/products"
              className="border-b border-muted/40 pb-0.5 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
            >
              View All →
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[
              { label: 'Tee — S/M/L/XL', price: '$34.99' },
              { label: 'Hoodie — S/M/L', price: '$59.99' },
              { label: 'Mug — 11oz', price: '$24.99' },
              { label: 'Cap — One Size', price: '$29.99' },
            ].map((item) => (
              <div
                key={item.label}
                className="min-w-[160px] flex-shrink-0 overflow-hidden rounded-lg border border-white/8 bg-background"
              >
                <div className="flex h-[120px] items-center justify-center bg-white/5">
                  <div className="h-12 w-12 rounded bg-white/10" />
                </div>
                <div className="p-3">
                  <p className="mb-1 text-xs text-muted">{item.label}</p>
                  <p className="text-sm font-semibold text-primary">{item.price}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
```

- [ ] **Step 2: Lint and build**

```bash
npm run lint && npm run build
```

Expected: No errors.

- [ ] **Step 3: Visual check**

Open http://localhost:3000. Verify: dark secondary background, green "Shop" label, horizontal scroll rail with 4 placeholder product cards showing label and price.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add Featured Products section to homepage"
```

---

### Task 4: How It Works Section

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add How It Works after Featured Products `</section>`**

```tsx
      {/* ── 3. HOW IT WORKS ──────────────────────────────────── */}
      <section className="border-t border-white/5 px-6 py-16 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="mb-2 text-xs tracking-[0.3em] text-muted uppercase">Process</p>
          <h2 className="mb-10 text-2xl font-bold text-primary">How It Works</h2>
          <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {[
              {
                step: '1',
                title: 'Generate',
                desc: 'Type a prompt. DALL-E creates your artwork in seconds.',
              },
              null,
              {
                step: '2',
                title: 'Apply',
                desc: 'Place your art on a tee, hoodie, mug, or more.',
              },
              null,
              {
                step: '3',
                title: 'Buy',
                desc: 'Checkout and get it delivered. Yours alone.',
              },
            ].map((item, i) => {
              if (!item) {
                return (
                  <div key={i} className="hidden text-2xl text-white/20 md:block">
                    →
                  </div>
                );
              }
              return (
                <div key={item.step} className="rounded-xl border border-white/8 bg-secondary p-6">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-accent text-sm font-bold text-accent">
                    {item.step}
                  </div>
                  <h3 className="mb-2 font-semibold text-primary">{item.title}</h3>
                  <p className="text-xs leading-relaxed text-muted">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
```

- [ ] **Step 2: Lint and build**

```bash
npm run lint && npm run build
```

Expected: No errors.

- [ ] **Step 3: Visual check**

Open http://localhost:3000. Verify: 3-step grid, green-bordered numbered circles, `→` arrows between steps on desktop, collapses to a single column on mobile (resize to 375px).

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add How It Works section to homepage"
```

---

### Task 5: AI Studio Teaser Section

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add AI Studio Teaser after How It Works `</section>`**

```tsx
      {/* ── 4. AI STUDIO TEASER ──────────────────────────────── */}
      <section className="relative overflow-hidden border-y border-accent px-6 py-14">
        <div className="absolute inset-0 bg-accent/3" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs tracking-[0.3em] text-accent uppercase">Create</p>
            <h2 className="mb-4 text-2xl font-bold text-primary">AI Studio</h2>
            <p className="mb-6 text-sm leading-relaxed text-muted">
              Describe anything — a cyberpunk city at dusk, a wolf in neon rain,
              an abstract glitch. Watch it appear in seconds, then put it on merch.
            </p>
            <Link
              href="/studio/generate"
              className="inline-block rounded bg-accent px-6 py-2.5 text-sm font-bold text-black transition-colors hover:opacity-90"
            >
              Open Studio →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-secondary">
            <div className="border-b border-white/8 px-4 py-3">
              <p className="text-xs italic text-muted">&ldquo;a neon wolf in cyberpunk rain&rdquo;</p>
            </div>
            <div className="flex h-40 items-center justify-center bg-background">
              <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-3xl text-white/20">
                ◈
              </div>
            </div>
            <div className="flex justify-end border-t border-white/8 px-4 py-3">
              <span className="rounded border border-accent px-3 py-1 text-xs text-accent">
                Apply to Merch →
              </span>
            </div>
          </div>
        </div>
      </section>
```

- [ ] **Step 2: Lint and build**

```bash
npm run lint && npm run build
```

Expected: No errors.

- [ ] **Step 3: Visual check**

Open http://localhost:3000. Verify: green top and bottom borders (`border-y border-accent`), subtle green tint on section background, two-column layout (copy left, mock prompt UI right). Stacks to single column on mobile.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add AI Studio Teaser section to homepage"
```

---

### Task 6: New Arrivals Grid + Final Verification

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add New Arrivals Grid after Studio Teaser `</section>`**

```tsx
      {/* ── 5. NEW ARRIVALS GRID ─────────────────────────────── */}
      <section className="border-t border-white/5 bg-secondary px-6 py-14">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-baseline justify-between">
            <div>
              <p className="mb-1 text-xs tracking-[0.3em] text-accent uppercase">Shop</p>
              <h2 className="text-2xl font-bold text-primary">New Arrivals</h2>
            </div>
            <Link
              href="/products"
              className="border-b border-muted/40 pb-0.5 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
            >
              Browse All →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {['$29.99', '$34.99', '$59.99', '$24.99', '$44.99', '$39.99'].map((price, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-lg border border-white/8 bg-background"
              >
                <div className="h-[100px] bg-white/5" />
                <div className="p-3">
                  <p className="text-xs text-muted">{price}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: No errors.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: Build succeeds. All routes compile. Zero TypeScript errors.

- [ ] **Step 4: Full visual review**

```bash
npm run dev
```

Open http://localhost:3000. Walk through each section top to bottom:

1. **Header** — dark translucent bg, green "AI MERCH" logo, muted nav links (Shop / Studio / Gallery)
2. **Hero** — subtle green radial glow, large bold heading, ghost + solid green CTAs
3. **Featured Products** — dark secondary bg, "Shop" green label, horizontal scroll rail with 4 cards
4. **How It Works** — 3-step grid, green-bordered circles, arrows visible on desktop
5. **AI Studio Teaser** — green top/bottom borders, green bg tint, mock prompt card on right
6. **New Arrivals** — dark secondary bg, 2-col mobile / 3-col desktop grid with 6 cards

Resize to 375px width and verify mobile:
- Featured Products scroll rail works horizontally
- How It Works collapses to 1 column (arrows hidden)
- Studio Teaser stacks vertically (copy above mock card)
- New Arrivals stays 2-col

- [ ] **Step 5: Final commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add New Arrivals Grid, complete homepage alternating lanes layout"
```
