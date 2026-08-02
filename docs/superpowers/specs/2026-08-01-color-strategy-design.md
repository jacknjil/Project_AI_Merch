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
- Never sacrifice legibility for aesthetics: a contrast floor is a hard constraint, not a preference — against the specific region of art the fill was matched to (see Selection's "Scope of the guarantee" for what this does and doesn't cover on multi-toned art).
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

**Scope of the guarantee:** the 4.5:1 floor is checked against the cluster the winning candidate was scored and picked for — not against the other two of the top-3 clusters. On a multi-toned image, the winning fill is guaranteed legible against the region of art it was matched to, but is not guaranteed to clear 4.5:1 against every other prominent region of the same art. This is the actual, as-implemented behavior (confirmed during final review: a realistic multi-toned fixture produced a winner passing its own cluster at >4.5:1 while dropping to ~1.18:1 against a different cluster of the same image). Extending the floor to require passing against all top-3 clusters was considered and explicitly deferred — see Decisions Made.

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
- **Contrast floor checked per-winning-cluster only, not against all top-3 clusters** — found as a genuine spec-vs-implementation gap during final review (a multi-toned fixture can pass its own cluster's floor while dropping well below 4.5:1 against a different cluster of the same art). Decided to keep the per-cluster-only check as implemented rather than strengthen it: the fill only needs to read clearly against the region of art it was actually matched to, which is the common case this feature targets; requiring a single color to also clear the floor against every other prominent region of the art is a stricter, different guarantee that wasn't part of the original ask and would need its own design pass if pursued later.
- **Fully contained to `colorExtraction.ts`** — no signature changes propagate to any caller, keeping this a low-blast-radius, independently testable change.

## Open Items for Planning

1. Confirm exact opaque-pixel alpha threshold (proposed ~200) against a few more real generated assets beyond the one diagnosed here, in case anti-aliased edges need a different cutoff.
2. Confirm `quantize`'s behavior when an image has fewer distinct colors than the requested cluster count (5) — expected to gracefully return fewer clusters, per standard MMCQ behavior, but not yet verified against this specific package version.
3. ~~Decide during implementation whether pixel sampling needs subsampling~~ **Resolved:** no subsampling. Final review measured ~480ms / ~240MB feeding the full opaque-pixel set through `quantize` against a real 1024×1024 production image. Accepted as-is — this path runs in the background n8n batch generation flow, not a user-facing request, so neither the latency nor the memory footprint is a problem at this image size. Revisit only if bounding boxes grow substantially larger than today's assets.
4. Confirm the predicted solid-canvas test values in the Testing Strategy section against the real implementation once written — they're hand-computed via relative-luminance reasoning, not yet executed.

## Follow-up Fix (Scoped 2026-08-02, Not Yet Implemented)

**Status:** Scoped from real production evidence after the redesign shipped (commits `88ebd44`..`9a7f1bf`). Not started — implementation deferred pending a go-ahead.

**Trigger:** Live n8n test run of rows 323/324/325 post-deploy. Row 324 (`assets/pXzADDbM9AAFabsVFdP6`) and row 325 (`assets/DQXBfeONaqrRWjYvbYnd`) both picked **Stone** (`#6B675F`) fill + white stroke, and both visually read as washed-out/hollow — user's words: "almost too light of an appearance and almost lost in the background."

**Root cause, confirmed via direct diagnostic run of `pickFillColor`/`extractOpaquePixels`/`topClusters` against the real downloaded assets — two compounding issues, both consequences of already-known, already-accepted design decisions:**

1. **Hue-fit tiebreak has no contrast-margin awareness.** For row 324's winning cluster `[242,238,220]` (near-white), Stone passed the floor at only 4.84:1 contrast and won because its hue was 9.1° from the cluster — but Charcoal was right there at 10.9° hue distance (only 1.8° further) with **12.02:1 contrast, 2.5x safer**. The current selection logic (`pickFillColor` in `colorExtraction.ts`) picks strictly by hue distance among floor-passers with no consideration of how much contrast margin is being given up to win a marginal hue improvement.
2. **The floor is checked against the matched art cluster, not the actual pixel region behind the rendered text.** This is the exact scope accepted in Decisions Made above (Option B, 2026-08-02) — restated here because it just produced a visible real-world failure, not a theoretical one: Stone's floor-check passed against the near-white cluster, but the text physically renders in the transparent margin above the art (effectively black in the shipped PNG). Stone against real black measures only **3.73:1** — below the 4.5 floor entirely. The white stroke compounds the effect: a dim, barely-passing gray fill ringed by a bright white outline reads as a hollow, pale letterform rather than a solid one.

**Proposed fix direction (not yet decided — needs a go/no-go before implementation):**

- **For issue 1:** add a contrast-margin guard to the hue-fit tiebreak — e.g., a candidate only wins on hue-closeness over a higher-contrast alternative if it isn't sacrificing more than some threshold of contrast (a fixed margin, or "unless the losing candidate's contrast is within X% of the winner's"). This directly targets the row 324/325 failure mode: two candidates within ~2° hue of each other should not be treated as a decisive win for the one with dramatically worse contrast headroom.
- **For issue 2:** contrast should be checked against the actual background the text renders on (the transparent margin — known at generation time to composite as black in the current pipeline), not only against the art's sampled clusters. This is a stronger, more direct fix than issue 1 alone and would have caught this exact case (3.73:1 against real black, below floor) regardless of the hue-tiebreak question.
- Both are changes to `pickFillColor`/`deriveTextColors` in `apps/frontend/src/lib/colorExtraction.ts` only — same low-blast-radius shape as the original redesign, no signature changes.
- Needs real regression fixtures built the same way Task 4's fix round was: from actual multi-toned production assets (row 324/325 downloads are already in hand), not synthetic solid-canvas approximations — that fixture-fidelity lesson is exactly what caused the original Task 4 gap and must not recur here.
