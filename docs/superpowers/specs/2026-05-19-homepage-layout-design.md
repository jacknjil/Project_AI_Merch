# Homepage Layout Design

**Date:** 2026-05-19
**Status:** Approved

## Goal

Replace the placeholder BentoGrid homepage with a practical, production-quality layout that gives equal weight to the shop (browse & buy) and the studio (AI art generation). The page must work for all audiences — first-time visitors who need explanation and returning users who want to act immediately.

## Layout Pattern: Alternating Lanes

Sections alternate between Shop and Create contexts as the user scrolls. Each section is full-width. The AI Studio lane uses the accent color (`#00FF41`) to visually distinguish the creative track from the commerce track.

## Sections (in order)

### 1. Hero

Full-width, dark background with subtle radial green glow. Centered layout.

- Eyebrow label: "AI-POWERED MERCH STUDIO" (accent color, wide tracking)
- H1: Bold, large — e.g. "Your Art. Your Merch."
- Subheadline: One short sentence explaining the value prop
- Two CTAs side by side: "Browse Shop" (ghost/outline) and "Start Creating →" (solid accent)

### 2. Featured Products

Dark background (`#0f0f0f`). Commerce lane.

- Section label: "Shop" (accent color, small caps) + heading "Featured Products"
- Horizontal scroll rail: 3–4 product cards visible, more implied
- Each card: product image placeholder, type/size info, price
- "View All →" link aligned right of the heading

### 3. How It Works

Dark background (`#0a0a0a`). Neutral lane — explains the concept for all audiences.

- Section label: "Process" + heading "How It Works"
- Three columns with arrows between: **Generate → Apply → Buy**
- Each step: numbered circle (accent color border), step name, one-line description
- No CTA — this section is informational only

### 4. AI Studio Teaser

Accent-bordered lane (`border-top/bottom: 1px solid #00FF41`, inner glow). Create lane.

- Section label: "Create" (accent color) + heading "AI Studio"
- Two-column layout:
  - Left: heading, 2–3 sentence description, "Open Studio →" CTA (solid accent)
  - Right: mock prompt UI showing a sample prompt and generated image preview
- Background subtle inner glow (use a Tailwind ring or a translucent `bg-accent/5` overlay — no raw `box-shadow` inline styles)

### 5. New Arrivals Grid

Dark background (`#0f0f0f`). Commerce lane.

- Section label: "Shop" (accent color) + heading "New Arrivals"
- 3-column product grid
- "Browse All →" link aligned right of the heading
- Cards match Featured Products style for consistency

## Component Changes

| File | Change |
|---|---|
| `src/app/page.tsx` | Full rewrite — remove BentoGrid, implement 5-section layout |
| `src/components/layout/Header.tsx` | Fix dark theme: replace `bg-white/80` with a dark background + `backdrop-blur-md` using `--color-secondary` CSS variable |
| `src/components/BentoGrid.tsx` | Keep file for now — no longer used by homepage but may be reused elsewhere |

## Styling Constraints

- All colors from `globals.css` CSS variables: `--color-background`, `--color-primary`, `--color-accent`, `--color-secondary`, `--color-muted`
- Tailwind v4 utility classes only — no inline `style` attributes in final code
- Dark theme forced — no light mode variants needed
- Mobile: horizontal scroll rail on Featured Products; How It Works collapses to single column; Studio Teaser stacks vertically

## Out of Scope

- Real product data from Firebase (sections use placeholder cards for now)
- Real AI-generated imagery in the Studio Teaser (static placeholder image)
- Animations or scroll effects
- Newsletter signup or testimonials sections
