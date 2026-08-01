# Text-Overlay Color Strategy — Design

**Date:** 2026-08-01
**Status:** Approved, ready for planning
**Author:** Session continuation, brainstormed with user
**Extends:** `2026-07-15-text-overlay-aesthetic-matching-design.md` (resolves that spec's Open Item #4: "Define the exact contrast-safety check algorithm for `colorExtraction.ts`")

## Problem

`deriveTextColors` (`src/lib/colorExtraction.ts`) picks the overlay text's fill color by inverting a single "dominant color" sampled from the art, then picks black/white stroke by contrast. Two problems surfaced diagnosing why row 322/323/324's ("Toadally enchanted," an amber/rust/moss toad illustration) rendered fill read as an out-of-place grayish-blue:

1. **Implementation bug:** `extractDominantColor` resizes the art's whole bounding box to 1x1 with `sharp`, but the returned bytes are premultiplied-alpha, and the code reads them as plain RGB with no un-premultiply step and no filtering of transparent margin pixels (which sit on stored RGB `(0,0,0)` under alpha 0). This darkens/skews the sampled color toward black in proportion to how much of the bounding box is empty space.
2. **Design flaw (the actual cause of this specific failure):** even with the bug fixed, mathematically inverting a warm dominant color (measured `#9F8D74` for the real toad asset) always produces its exact color-wheel complement — `#60728B`, a blue-gray — which is what "invert" is defined to do. Complementary inversion guarantees numeric contrast but not aesthetic fit; it fails hardest on warm/earthy art, exactly like this asset.

## Goals

- Fill color should look like something a human designer picked for this specific piece of art — plausible, on-palette, intentional — not a mathematically-guaranteed-legible but visually arbitrary inverse.
- Never sacrifice legibility for aesthetics: a contrast floor is a hard constraint, not a preference.
- Stay within the existing architecture: `deriveTextColors(artBuffer): Promise<ColorPair>` keeps its exact signature; no changes ripple to `textOverlayStyling.ts`, `route.ts`, `textOverlay.ts`, or `textRender.ts`.
- Fix the premultiplied-alpha/transparent-pixel sampling bug as part of this work (it's in the same function being rewritten anyway).
- Reuse a proven algorithm rather than hand-rolling one: researched `node-vibrant`, `colorthief`, `get-image-colors`, `extract-colors`, and `quantize` (npm registry, checked maintenance/deps/typings) before choosing.

## Non-Goals

- Stroke color selection — stays the existing binary black/white pick, unchanged. A stroke's job is a legibility outline, not a design statement; doubling the palette-selection logic onto stroke adds risk (more ways the pair could end up low-contrast) for little visible benefit.
- Any change to font/shape selection (`artStyleAnalysis.ts`, `fontLibrary.ts`) — untouched, separate concern (see `project_font_shaping_gsub_fallback_fix.md`).
- Sheet-level manual color override columns — a real, separately-discussed idea (paused mid-conversation to investigate this bug instead), not part of this design.
- Full historical backfill/reprocessing of past assets with the new color logic — out of scope here, same as the original 2026-07-15 spec's stance on backfills.

## The Curated Palette

Fill is always one of these 10 pre-vetted tones — never a computed/arbitrary color. Deliberately deep/muted rather than bright/saturated: this is text sitting on top of full-color illustrated art, so a loud saturated fill would visually compete with the art rather than sit on it the way a human-picked accent would.

| Name | Hex | Character |
|---|---|---|
| Charcoal | `#2C2C2A` | near-black neutral (today's current fill default) |
| Cream | `#F5F0E6` | warm off-white neutral |
| Espresso | `#4A3427` | deep warm brown |
| Terracotta | `#B5603F` | warm rust/clay |
| Forest | `#3B5D42` | deep earthy green |
| Slate | `#3E5C6B` | deep cool blue-gray |
| Burgundy | `#6B2E3A` | deep muted wine |
| Mustard | `#C9A227` | warm gold |
| Navy | `#28374D` | deep cool blue |
| Stone | `#6B675F` | low-saturation warm gray (fallback for genuinely mixed/neutral art) |

## Architecture

Entirely contained in `src/lib/colorExtraction.ts`. One new dependency: `quantize` (+ `@types/quantize` for typings) — the median-cut (MMCQ) clustering algorithm that `colorthief` and `node-vibrant` both wrap internally. Chosen over pulling in a full swatch-extraction library (`node-vibrant`, `colorthief`) because those do their own image decoding — a second, redundant image-parsing stack alongside `sharp`, which this project has already been burned by adding unnecessary imaging-dependency surface to (the font-path Docker bug, the JPEG/alpha conversion bug). `quantize` is the bare clustering primitive; we feed it raw pixels `sharp` already decodes, and write our own curated-palette matching on top (no library does "match against my specific 10 tones" anyway).

### Extraction

Replaces `extractDominantColor`:

1. Get the art's trimmed bounding box (existing `getArtBoundingBox` — unchanged).
2. Decode raw RGBA pixels for that box via `sharp().raw()`.
3. Filter to fully-opaque pixels only (alpha > ~200, allowing anti-aliased edges) — this alone fixes the premultiplied-alpha/transparent-margin contamination bug, since contaminated pixels never enter the sample.
4. Feed the filtered `[r,g,b]` pixel triples into `quantize(pixels, 5)` for ~5 representative clusters.
5. Map every sampled pixel back to its cluster via `cmap.map()` to get real population counts (not just trusting internal ordering).
6. Take the **top 3 most populous** clusters — not just the single largest, since one big blob is sometimes a background wash or highlight rather than "the color a person would name for this piece."

### Selection

New logic replacing the invert step in `deriveTextColors`: for each of the 3 clusters, score every curated candidate — must clear a **4.5:1 WCAG contrast ratio** against that cluster's color (hard floor, non-negotiable), then rank passing candidates by hue closeness (circular HSL hue distance) to the cluster. Across all 3 clusters, take the single best (cluster, candidate) pairing overall.

Grayscale degradation: if a cluster's saturation is near-zero (pure black/white/gray art), hue is undefined/meaningless, so selection skips straight to "highest-contrast passing candidate" for that cluster.

Stroke: unchanged — computed from the winning fill color exactly as today (`contrastRatio(fillRgb, BLACK) >= contrastRatio(fillRgb, WHITE) ? BLACK : WHITE`).

## Data Flow

```
art PNG buffer
      │
      ▼
getArtBoundingBox (unchanged)
      │
      ▼
sharp raw RGBA decode of that box
      │
      ▼
filter to opaque pixels (alpha > ~200)
      │
      ▼
quantize(pixels, 5) → cmap
      │
      ▼
map pixels back to clusters → population counts → top 3
      │
      ▼
for each of top 3 clusters:
  score curated candidates (contrast floor 4.5:1, then hue distance)
      │
      ▼
best (cluster, candidate) pair overall → fill
      │
      ▼
stroke = existing black/white contrast pick against fill (unchanged)
      │
      ▼
{ fill, stroke } — same ColorPair shape as today
```

## Error Handling

Unchanged shape: the existing top-level try/catch in `deriveTextColors` still wraps everything. Any failure — `quantize` throwing, zero opaque pixels found (fully transparent image), any unexpected error — falls back to today's exact default pair `#2C2C2A` / `#FFFFFF`. Never blocks asset generation, matching the original 2026-07-15 spec's non-negotiable safety principle.

## Testing Strategy

`colorExtraction.test.ts`'s two existing solid-canvas tests need **updated expected values**, not new logic. Worked through both by hand via relative-luminance reasoning (not yet run against a real implementation, since the algorithm doesn't exist yet — treat these as strong predictions to verify during implementation, not settled numbers):

- Solid black canvas (was `{fill:'#FFFFFF', stroke:'#000000'}`): only Cream clears a real contrast margin against pure black, predicted to become `{fill:'#F5F0E6', stroke:'#000000'}`.
- Solid white canvas (was `{fill:'#000000', stroke:'#FFFFFF'}`): Charcoal is the darkest/highest-contrast candidate, predicted to become `{fill:'#2C2C2A', stroke:'#FFFFFF'}`.
- The invalid-buffer fallback test is unchanged (still asserts the default pair).

New tests to add:
- **Regression test** reproducing the actual bug: a synthetic image built from the real toad asset's measured proportions (dominant `~#9F8D74` warm tan) must resolve to a warm curated candidate (Terracotta or Espresso), never a blue/cool one.
- **Multi-toned image** (e.g. two large distinct-colored regions) to exercise the top-3-cluster search, confirming it doesn't just blur them into one wrong average.
- **All-transparent image** confirming the default-pair fallback fires (zero opaque pixels found).
- **Near-grayscale image** confirming the hue-fit skip degrades correctly to highest-contrast-only selection.

No changes needed to `textOverlay.test.ts`, `fontLibrary.test.ts`, or any route-level test — this is fully contained to `colorExtraction.ts`.

## Decisions Made

- **Curated fixed palette (10 tones), not a fully-derived/computed color** — user's explicit direction: "a small fixed palette we pick from based on contrast and hue fit," matching "closer to what a human designer eyeballs" over a mathematically-derived-but-arbitrary result.
- **Stroke stays binary black/white** — a stroke is a legibility outline, not a design statement; not worth doubling the selection logic and its failure modes onto it.
- **`quantize` over `node-vibrant`/`colorthief`** — same underlying algorithm those libraries wrap, without their redundant image-decoding stack running alongside `sharp` in the same request path. Checked npm registry for maintenance/dependencies/typings before deciding (`quantize` + `@types/quantize` both real and typed).
- **Top 3 clusters searched, not just the single largest** — a lone biggest cluster can be a background wash or highlight rather than the art's recognizable color; searching multiple candidates against the curated palette is closer to how a person would actually pick.
- **4.5:1 WCAG contrast floor, applied as a hard constraint before hue-fit** — legibility is non-negotiable; hue-fit is the secondary/aesthetic goal once legibility is already guaranteed.
- **Fully contained to `colorExtraction.ts`** — no signature changes propagate to any caller, keeping this a low-blast-radius, independently testable change.

## Open Items for Planning

1. Confirm exact opaque-pixel alpha threshold (proposed ~200) against a few more real generated assets beyond the one diagnosed here, in case anti-aliased edges need a different cutoff.
2. Confirm `quantize`'s behavior when an image has fewer distinct colors than the requested cluster count (5) — expected to gracefully return fewer clusters, per standard MMCQ behavior, but not yet verified against this specific package version.
3. Decide during implementation whether pixel sampling needs subsampling (e.g. every Nth pixel) for performance on very large bounding boxes, or whether feeding `quantize` the full opaque-pixel set is fast enough as-is (no perf issue is expected at these image sizes, but not yet measured).
4. Confirm the predicted solid-canvas test values in the Testing Strategy section against the real implementation once written — they're hand-computed via relative-luminance reasoning, not yet executed.
