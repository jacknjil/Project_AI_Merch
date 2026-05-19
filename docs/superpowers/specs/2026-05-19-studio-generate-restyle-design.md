# Design Spec: AI Studio Generator Restyle

**Date:** 2026-05-19
**Sprint:** 3
**Scope:** `/studio/generate` page only

---

## Goal

Convert `/studio/generate` from raw inline-style HTML to the dark cyberpunk design system (Tailwind v4, existing `Button`/`Input`/`Card` components). No logic changes — purely a presentation layer swap.

---

## Layout

Two-column split at `lg` breakpoint, single-column stack below it:

- **Left panel** — fixed width ~380px, sticky positioning, contains all controls
- **Right panel** — flex-grow, contains empty state or results grid
- Both panels sit inside a `max-w-7xl mx-auto` wrapper with horizontal padding

---

## Left Control Panel

Header: "Generate" with a green (`--color-primary`) underline accent. The header is structured as a tab-bar slot so future tabs ("Settings", "History") can be added without restructuring.

Controls rendered top to bottom, each with a `<label>` + component:

| Field | Component | Detail |
|---|---|---|
| Title | `Input` | Optional; placeholder "Name your design…" |
| Niche | `Input` | Optional; placeholder "e.g. 80s-retro, kawaii-animals" |
| Template | `<select>` | Styled to match `Input` height/border/bg; uses existing `PROMPT_TEMPLATES` |
| Count | `<input type="number">` | Styled to match `Input`; 1–8 range; existing validation unchanged |
| Prompt | `<textarea>` | Styled to match `Input`; 5 rows; existing logic unchanged |

`Button variant="primary"` at bottom of panel. Loading state shows spinner text "Generating…". Error message renders below button in `text-red-400`.

---

## Right Results Panel

### Empty state (before first generation)

Centered vertically and horizontally in the panel:

- Icon: a simple sparkle or image SVG in muted green
- Heading: "Your designs will appear here"
- Subtext: "Choose a template or write a prompt, then hit Generate"

The panel renders this placeholder on load so no layout shift occurs when results arrive.

### Results grid

`grid-cols-2` at default, `grid-cols-3` at `xl` breakpoint.

Each card uses the existing `Card` component:

- Image fills the top portion (1:1 aspect ratio, `object-cover`)
- Below: title in white, niche in muted gray
- Top-right corner badge: "Saved ✓" in small green text — confirms auto-save to Gallery without requiring an action button
- No other CTAs on the card (add-to-cart / apply-to-product deferred to a future sprint)

---

## What Does Not Change

- All API call logic (`/api/generate-asset`)
- All React state (`prompt`, `title`, `niche`, `count`, `loading`, `error`, `generatedAssets`)
- `PROMPT_TEMPLATES` integration
- Firebase upload behavior (handled server-side in the API route)
- Page route and file location (`src/app/studio/generate/page.tsx`)

No new files are created. The existing `page.tsx` is converted in place.

---

## Future Upgrade Path

The design is intentionally structured to make later enhancements drop-in:

- **Step flow (Option B):** The control panel's vertical stack can be wrapped in a stepper without changing the underlying fields or state.
- **Collapsible sidebar (Option C):** A single `isOpen` boolean + CSS transition on the left panel width is all that's needed — the two-column flex layout already supports it.
- **Post-generation actions:** Adding "Apply to product" or "Add to cart" buttons on result cards requires only adding CTA elements to the card — the grid and card structure don't change.

---

## Success Criteria

1. Page renders with dark cyberpunk theme — no raw inline styles remain
2. All existing functionality works identically (generate, display, auto-save)
3. Layout is two-column on desktop, single-column on mobile
4. Empty state renders on load; no layout shift when results appear
5. `npm run build` passes with no new type errors or lint warnings
