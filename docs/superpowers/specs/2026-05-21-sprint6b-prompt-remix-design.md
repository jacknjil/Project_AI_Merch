# Sprint 6B — Prompt Remix Design Spec

**Date:** 2026-05-21  
**Status:** Approved  
**Sprint:** 6B

---

## Overview

Prompt Remix lets users take any published asset from the gallery, inspect the prompt that generated it, edit it, and generate new variations — all without leaving the studio context. It closes the creative loop between browsing and generating.

---

## Entry Point

The gallery page (`/studio/gallery`) gains a second action button alongside the existing "Use This Art →" when an asset is selected.

**Button layout (below asset grid, full width):**

```text
[ Use This Art →  ]  [ Remix Prompt → ]
```

- Both buttons are disabled until an asset is selected
- "Use This Art →" — `variant="primary"`, existing behavior (`/studio/apply?assetId=X`)
- "Remix Prompt →" — `variant="outline"`, navigates to `/studio/remix?assetId=X`
- Layout: `flex gap-3`, each button `flex-1`

**File changed:** `src/app/studio/gallery/page.tsx`

---

## Remix Page

**Route:** `/studio/remix?assetId=X`  
**File:** `src/app/studio/remix/page.tsx` (new)

### Layout

Two-column layout matching `/studio/generate`:

**Left panel** (`w-96`, sticky, scrollable):

- Page header: `AI Studio` eyebrow label + `Remix` heading
- Source asset thumbnail — square image of the original asset with its title beneath it, separated by a subtle `border-white/10` divider
- Pre-filled editable fields (all editable):
  - Title (`Input`)
  - Niche (`Input`)
  - Number of images (number input, 1–8)
  - Prompt (textarea, 5 rows)
- "Generate Remix" button — `variant="primary"`, `size="lg"`, full width
- Error message slot below button

**Right panel** (`flex-1`):

- Empty state on load: sparkle icon + "Your remixed designs will appear here" + supporting copy
- After generation: same card grid as `/studio/generate` — image with "Saved ✓" badge, title, niche, "Apply to Product →" link per card

### Data Loading

On mount, the page:

1. Reads `assetId` from `useSearchParams()`
2. Calls `getAsset(assetId)` (already exported from `src/hooks/useAssets.ts`)
3. Pre-fills: `title`, `niche`, `prompt` from the returned asset
4. If `prompt` is absent on the asset doc, textarea starts empty with placeholder: `"No original prompt — write your own."`

**Loading state:** left panel shows a skeleton (pulse animation on field areas) while fetching  
**Error state:** "Asset not found" message with a back link to `/studio/gallery`  
**Missing assetId:** if `assetId` is absent from the URL, redirect immediately to `/studio/gallery`

### Generation

On "Generate Remix":

- POSTs to `/api/generate-asset` with `{ prompt, title, niche, count }`
- Same request/response shape as the generate page
- Results render in the right panel in-place (replaces empty state)
- Each result card has "Apply to Product →" → `/studio/apply?assetId=<newId>`

**New assets generated here are saved with `published: false`** — admin must publish before they appear in the gallery (consistent with all other generation routes).

---

## Styling

Follows existing dark theme conventions throughout:

- Borders: `border-white/5`, `border-white/10`
- Text: `text-primary`, `text-muted`, `text-accent`
- Backgrounds: `bg-secondary`, `bg-background`
- Components: existing `Button`, `Input` from `src/components/ui/`
- No new CSS variables, no new Tailwind classes beyond what's already in use

---

## Files Changed

| File                              | Change                                                 |
| --------------------------------- | ------------------------------------------------------ |
| `src/app/studio/gallery/page.tsx` | Add "Remix Prompt →" button alongside "Use This Art →" |
| `src/app/studio/remix/page.tsx`   | New page — self-contained remix flow                   |

**No changes to:** API routes, `types.ts`, `useAssets.ts`, or any other existing files.

---

## Out of Scope

- Prompt history / version tracking
- Saving a remix back to the source asset's lineage
- Side-by-side diff of original vs remixed prompt
- Sharing remix results

These can be revisited in a future sprint if needed.

---

## Notes

- Design and behavior can be reassessed and modified during or after implementation
- The spec captures intent; specific layout or field decisions may be adjusted as the page is built
