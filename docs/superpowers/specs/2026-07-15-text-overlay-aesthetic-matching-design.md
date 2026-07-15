# Text-Overlay Aesthetic Matching — Design

**Date:** 2026-07-15
**Status:** Approved, ready for planning
**Author:** Session continuation, brainstormed with user

## Problem

The text-overlay pipeline (`src/lib/textOverlay.ts`, `src/lib/textRender.ts`) shipped 2026-07-14 with a single hardcoded font (`LuckiestGuy-Regular.ttf`, a bold rounded display font) and hardcoded colors (`#2C2C2A` fill, `#FFFFFF` stroke), used identically on every generated asset regardless of the artwork's actual style, mood, or palette. Reviewing real output, the on-design text has no visual relationship to the art it sits on — same font, same colors, on a vintage badge, a minimalist line drawing, or a neon cyberpunk piece alike.

Two sheet columns exist that seem relevant — `colorPalette` and `styleTag` — but investigation showed:
- `colorPalette` and `styleTag` are already fed into the n8n GPT prompt that instructs Recraft's *art generation* (confirmed in `project_n8n_prompt_engineering_2026-06-15.md`), so they represent generation *intent*, not necessarily what Recraft actually rendered (image models drift from instructions).
- Neither field is read anywhere in the text-overlay code path — `styleTag` reaches `create-asset/route.ts` but is only persisted to Firestore; `colorPalette` isn't forwarded to the route at all.
- `concept` is pure subject-matter text, fully absorbed into the art prompt already, with no direct color/font signal of its own.

Spelling/wording quality of GPT-invented phrases was raised and explicitly ruled out of scope for this design (separate concern, not addressed here).

## Goals

- Font and color of the composited text should visually relate to the actual generated artwork, not a fixed constant.
- Ground truth for color comes from the actual rendered pixels (self-correcting when Recraft drifts from the sheet's palette intent), not from sheet metadata directly.
- Sheet metadata (`colorPalette`, `styleTag`) is used as *context*, not as the sole source of truth.
- Stay additive and safe: any failure in the new logic must fall back to today's exact behavior, never block or degrade asset generation.
- Apply to new asset generations going forward. Separately, investigate feasibility of reprocessing the ~9-10 most recent phrase-bearing assets generated since the text-overlay feature shipped (2026-07-14 onward) — feasibility contingent on whether pre-overlay art was retained (see Open Risk below).

## Non-Goals

- Spelling/grammar correction of GPT-invented or sheet-sourced phrases.
- Full historical backfill of the entire asset catalog.
- Shape/curve-aware text layout (round badges, arcs) — tracked separately in `project_text_overlay_shape_awareness_gap.md`, explicitly deferred.
- Changing the zone-computation or shrink-fallback logic — this design only changes *what* gets rendered (font, fill, stroke), not *where* or *how much room* it gets.

## Architecture

Two new, independent modules, plus targeted changes to the existing overlay pipeline and the `create-asset` route.

### `src/lib/artStyleAnalysis.ts` (new)

Calls GPT-4o vision with the generated PNG plus `colorPalette` and `styleTag` sheet values as text context. The prompt constrains the response to one of a fixed set of font categories:

- `bold-display` (today's `LuckiestGuy-Regular.ttf`)
- `elegant-serif`
- `playful-script`
- `vintage-distressed`
- `minimal-sans`

Five categories to start; the set is designed to extend to 7-8 later once real generations reveal gaps (e.g. a dedicated cyberpunk/tech category). Each category maps 1:1 to one bundled OFL-licensed `.ttf` in `src/lib/fonts/`. Sourcing the 4 new font files is an implementation-time task, not decided in this doc.

Returns `{ fontCategory: FontCategory }`. On any failure (network error, timeout, malformed/out-of-enum response), the caller falls back to `bold-display`.

### `src/lib/colorExtraction.ts` (new)

Pixel-samples the actual art region — reusing `getArtBoundingBox`'s trim-based approach already in `textOverlay.ts` — for a dominant/accent color, then derives a legible fill+stroke pair via a contrast-safety check against that sampled color (so text never lands near-invisible against similarly-toned art, the same problem a fixed white stroke was originally masking).

Returns `{ fill: string; stroke: string }`. On failure or a pair that fails the contrast check, falls back to today's `#2C2C2A` / `#FFFFFF`.

### `textRender.ts` / `textOverlay.ts` (modified)

`renderTextToSvg` already accepts `fill`/`stroke` as optional parameters — currently unused by any caller. `applyTextOverlay` and `applyTextOverlayWithFallback` gain parameters to thread a font buffer and color pair through to `renderTextToSvg`, replacing the currently-hardcoded font load and default colors. No changes to `getArtBoundingBox`, `computeTextZone`, `compositeTextOverArt`, or `shrinkArtForTextZone`.

### `create-asset/route.ts` (modified)

At the existing `if (phrase)` gate, before calling `applyTextOverlayWithFallback`:

1. Run style analysis and color extraction concurrently (`Promise.all`) — independent of each other, both operate on the same generated PNG buffer.
2. Resolve the font category to its bundled font buffer.
3. Pass `{ fontBuffer, fill, stroke }` into `applyTextOverlayWithFallback` in place of today's single hardcoded font.

## Data Flow

```
Recraft PNG generated
        │
        ▼
  phrase present? ──no──> composite skipped (unchanged)
        │ yes
        ▼
 ┌──────────────────────┬──────────────────────┐
 │ artStyleAnalysis()    │ colorExtraction()     │   (parallel)
 │ GPT-4o vision +       │ sharp pixel sampling  │
 │ colorPalette/styleTag │ on trimmed art region │
 │ context               │                       │
 └──────────┬────────────┴───────────┬───────────┘
            ▼                        ▼
      fontCategory              {fill, stroke}
            │                        │
            ▼                        │
   font file lookup                  │
            │                        │
            └───────────┬────────────┘
                         ▼
        applyTextOverlayWithFallback(art, phrase,
              fontBuffer, fill, stroke)
                         │
                         ▼
     existing zone-compute + shrink-fallback logic
                (completely unchanged)
```

## Error Handling

Matches the existing `create_asset.text_overlay_failed` pattern already in the route — additive, never blocking:

- Style analysis fails (network/timeout/malformed/out-of-enum) → fall back to `bold-display` category, log `create_asset.style_analysis_failed`.
- Color extraction fails or produces a low-contrast pair → fall back to `#2C2C2A` / `#FFFFFF`, log `create_asset.color_extraction_failed`.
- Worst case for any single asset: renders exactly as it does today. Never worse than current behavior.

## Retroactive Reprocessing

Scope: the ~9-10 most recent phrase-bearing assets, generated since the text-overlay feature shipped (2026-07-14 onward) — not a full catalog backfill, not a permanent bulk tool.

Planned approach: a one-off ops script (`ops/reprocess-text-overlay.mjs`), following the existing `n8n-*.mjs` script conventions (dry-run default, explicit ID list, idempotent).

**Open risk, not resolved by this design:** feasibility depends on whether the *pre-overlay* art (before today's text was composited) is still retrievable from Storage for these assets. If only the already-composited final image was retained, re-running the new pipeline would composite new text over old text rather than replacing it. This must be checked during planning, before committing to the reprocess step — if pre-overlay art isn't available, the reprocess may need to fall back to a from-scratch regeneration of those rows instead (different cost/scope tradeoff), or be dropped.

## Testing Strategy

- **`colorExtraction.ts`** — pure/local, no network. Tests build synthetic PNGs with `sharp` (known solid colors, known transparent regions), following the same pattern as `textOverlay.test.ts`. Assert extracted dominant color and derived fill/stroke pair, including a case that forces the contrast-safety fallback.
- **`artStyleAnalysis.ts`** — the only networked piece. Unit tests mock the OpenAI client: correct category for a well-formed response, fallback to `bold-display` on malformed/out-of-enum response, fallback on thrown/timeout error. Exact mocking pattern to match whatever convention already exists for OpenAI calls elsewhere in the repo (confirmed during planning).
- **`textOverlay.ts` changes** — extend the existing test file's cases to cover the new `fontBuffer`/`fill`/`stroke` parameters threading through correctly. No mocks needed, same real-buffer style as today.
- **Integration** — one test on the `create-asset` route confirming that when both new modules fail, the asset still generates using today's exact defaults.
- **E2E** — out of scope; no user-facing UI path is touched (server-side batch generation only). The existing manual ops script (`text-overlay-prototype.mjs`) serves as the visual-inspection step, extended to print which category/colors were chosen for easy eyeballing during implementation.

## Decisions Made

- **Font: fixed 5-category set, one bundled font per category, extensible later** — chosen over a sheet-metadata-driven taxonomy (categories wouldn't map cleanly to existing `styleTag`/niche values) and over freeform GPT suggestion + fuzzy-matched large font library (too much scope/risk for a first version).
- **Color: sampled from actual rendered pixels, not sheet metadata** — `colorPalette` reflects generation intent, not guaranteed output; pixel sampling is self-correcting when Recraft drifts.
- **Sheet metadata as context, not source of truth** — `colorPalette`/`styleTag` passed into the same GPT vision call as text context (no added cost, same API call), so classification is informed by intent without being overridden by it.
- **New assets only, plus a scoped one-off reprocess of ~9-10 recent assets** — not a full backfill tool; feasibility of the reprocess is contingent on pre-overlay art retention, flagged as an open risk rather than resolved here.
- **Spelling/wording explicitly out of scope** — raised by the user, then explicitly excluded; a separate concern from visual aesthetics.

## Open Items for Planning

1. Source 4 new OFL-licensed font files (elegant-serif, playful-script, vintage-distressed, minimal-sans).
2. Confirm whether pre-overlay art is retrievable for the ~9-10 candidate reprocess assets; adjust reprocess plan if not.
3. Confirm existing OpenAI-mocking convention in the test suite before writing `artStyleAnalysis.test.ts`.
4. Define the exact contrast-safety check algorithm for `colorExtraction.ts` (e.g. WCAG contrast ratio threshold).
