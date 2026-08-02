# Two-Phrase Text Overlay Fallback & Observability — Design

**Date:** 2026-08-02
**Status:** Approved, ready for planning
**Author:** Session continuation, brainstormed with user
**Extends:** `2026-07-16-text-overlay-shape-awareness-design.md` (the circular-arc shrink-retry mechanism this design corrects the trigger condition on)

## Problem

Row 326 ("Opossum's Almanac," a circular-badge wreath illustration) was generated with two phrases — `phrase: "Nature's Little Necromancer"` (primary/top) and `phraseSecondary: "Reader of the Woods"` (secondary/bottom) — but the shipped image only shows the bottom phrase. The Firestore doc reads `overlayApplied: true`, which is misleading: it only proves *something* rendered, not that both requested phrases did.

**Root cause (two stacked issues, same shape as the font-shaping and color bugs found earlier this session — a real failure mode masked by an all-or-nothing signal):**

1. **The retry trigger is too coarse.** `applyTextOverlayWithFallback` (`textOverlay.ts`) decides whether to retry with shrunk art by checking `!output.equals(artBuffer)` — "did anything change at all." When the primary phrase's arc throws `ArcTextTooSmallError` (silently caught, swallowed, and skipped per-phrase inside `applyTextOverlay`'s circular branch) but the secondary phrase succeeds, `output` already differs from the input, so the function returns immediately — never attempting the shrink retry, even though that retry (which already uses `center` anchoring specifically when a secondary phrase is present, freeing room on both the top and bottom zones at once) would likely have fixed both phrases.
2. **No true last-resort fallback for arced text.** If a phrase's arc still can't fit even on shrunk art, it is dropped entirely with no rendering attempted at all — unlike the rectangular branch, which never throws (`renderTextToSvg` shrinks its font size to fit rather than imposing a hard minimum) and therefore never silently drops text.
3. **`overlayApplied` cannot distinguish "both phrases rendered" from "only one did."** It is a single boolean derived from whole-buffer equality, so a partial success reads identically to a full success.

## Goals

- A two-phrase request either renders both phrases, or renders both via straight-line fallback where arcing genuinely isn't possible — never silently ships with one phrase missing while reporting success.
- Reuse the existing shrink-retry mechanism (already correctly built for the two-phrase case via `center` anchoring) rather than inventing a new one — the fix is to the *trigger condition*, not the retry tool itself.
- Firestore records per-phrase outcome (applied normally, applied via straight-line fallback, or absent) so a future silent-degradation case is visible instead of hidden behind one flag — the same lesson as `overlayApplied`'s original addition after the font-shaping bug.
- Rectangular-shape behavior is unchanged — it was never affected by this bug class.

## Non-Goals

- No change to the arc-fit math itself (`MIN_ARC_FONT_SIZE`, `MAX_ARC_ANGLE`, radius/slack constants) — those are tuned correctly; this is a control-flow fix around when retries happen and what the last resort is.
- No generalized N-phrase pipeline — this design only ever has two phrase slots (primary/secondary), and building for arbitrary N is unneeded speculative generality.
- No change to the shrink scale/anchor logic in `shrinkArtForTextZone` — reused as-is.
- No change to how `n8n`/the Google Sheet resolves `phrase`/`phraseSecondary` — that layer is out of scope, this is entirely the app-side rendering pipeline.

## Architecture

Entirely contained to `apps/frontend/src/lib/textOverlay.ts`, with one new field addition consumed by `apps/frontend/src/app/api/n8n/create-asset/route.ts`. Same low-blast-radius shape as the color-strategy redesign: two functions change return type, exactly one caller updates to match.

```ts
export interface OverlayResult {
  buffer: Buffer;
  primaryApplied: boolean;        // true if the primary phrase rendered at all (arc or straight-line)
  secondaryApplied: boolean;      // true if a secondaryPhrase was requested and rendered; always false if none was requested
  primaryUsedFallback: boolean;   // true if primary rendered via straight-line instead of its shape's natural rendering
  secondaryUsedFallback: boolean;
}
```

`applyTextOverlay` and `applyTextOverlayWithFallback` both change from `Promise<Buffer>` to `Promise<OverlayResult>`.

### Retry algorithm (replaces the single equals-check in `applyTextOverlayWithFallback`)

1. Attempt the full render (primary, and secondary if present) on the original art via `applyTextOverlay`, exactly as today (arced for `circular` shape, straight for `rectangular`).
2. If **either** requested phrase did not apply, retry the full render on `shrinkArtForTextZone`'s output — reusing the existing `center`-anchor-when-`secondaryPhrase`-present / `bottom`-anchor-otherwise logic unchanged.
3. For **any** phrase still not applied after the shrink retry (only reachable for `circular` shape, since `rectangular` never fails to apply): render that specific phrase as straight-line text via `renderTextToSvg` + `compositeTextOverArt`, using the same `computeTextZone`/`computeBottomTextZone` zone the arced attempt used, composited onto whatever buffer resulted from step 1 or 2. Mark that phrase's `*UsedFallback: true`.
4. Return the final `OverlayResult` with accurate per-phrase flags at every step.

`rectangular` shape's actual pixel output is unaffected by this change — it never fails to apply a phrase today, so its flags will simply report `true`/`true` (or `false` for `secondary*` fields when no secondary phrase was requested) reflecting what already happens, now explicitly tracked instead of inferred.

### `applyTextOverlay`'s circular branch changes

Currently, a failed primary arc silently sets `withPrimary = artBuffer` and continues to attempt the secondary with no record of the failure. This becomes: track `primaryApplied = false` in that catch branch (no straight-line attempt here — the straight-line last resort is `applyTextOverlayWithFallback`'s job, only reached after the shrink retry also fails, per the retry algorithm above) and return the `OverlayResult` with that flag set, so the caller (`applyTextOverlayWithFallback`) knows to retry.

## Data Flow

```
applyTextOverlayWithFallback(art, phrase, font, colors, shrinkScale, shape, secondaryPhrase)
      │
      ▼
applyTextOverlay(art, ...) → OverlayResult
      │
      ├─ both requested phrases applied? ──yes──▶ return as-is
      │
      no
      ▼
shrinkArtForTextZone(art, shrinkScale, secondaryPhrase ? 'center' : 'bottom')
      │
      ▼
applyTextOverlay(shrunkArt, ...) → OverlayResult
      │
      ├─ both requested phrases applied now? ──yes──▶ return
      │
      no (circular shape only — rectangular always succeeds here)
      ▼
for each still-unapplied phrase:
  render straight-line text into its zone, composite onto current buffer
  mark that phrase's *UsedFallback = true
      │
      ▼
return final OverlayResult
```

`route.ts` unpacks the `OverlayResult` instead of comparing buffers:

```ts
const result = await applyTextOverlayWithFallback(...);
png = result.buffer;
overlayApplied = result.primaryApplied || result.secondaryApplied; // unchanged existing field, now correctly derived
```

`OverlayResult`'s `secondary*` fields are plain `boolean` internally (simply `false` when no secondary phrase was requested — `applyTextOverlay`/`applyTextOverlayWithFallback` don't need a tri-state, since they always know whether they were asked to render one). The `null`-when-not-requested convention is a route-level translation, applied only when writing to Firestore, to match `overlayApplied`'s existing convention for that collection:

```ts
secondaryOverlayApplied: phraseSecondary ? result.secondaryApplied : null,
secondaryUsedFallback: phraseSecondary ? result.secondaryUsedFallback : null,
```

New Firestore fields on the asset doc, written alongside the existing `overlayApplied` (which stays, unchanged in meaning, for existing consumers):

- `primaryOverlayApplied: boolean`
- `secondaryOverlayApplied: boolean | null` (`null` when no secondary phrase was requested, mirroring `overlayApplied`'s existing `null`-means-"not requested" convention — translated from `OverlayResult`'s plain boolean at the route layer, per above)
- `primaryUsedFallback: boolean`
- `secondaryUsedFallback: boolean | null` (same translation)

## Error Handling

No new failure modes. The route's existing top-level try/catch (`catch (overlayErr) { overlayApplied = false; log(...) }`) is unchanged as the final safety net for anything unexpected (e.g. `sharp` throwing on a corrupt buffer). The one genuinely new "nothing rendered" case is unchanged from today: if `computeTextZone`/`computeBottomTextZone` returns zero height/width even after shrinking (canvas has no usable margin at all), that phrase's flags report `false` — the same rare edge case as today, now visible in Firestore instead of silent.

## Testing Strategy

Real regression fixtures built from the actual row 326 download (already in hand — the exact asset that surfaced this bug), not synthetic approximations, per the fixture-fidelity lesson from the color-strategy Task 4 fix round:

- **The exact row 326 case:** long primary phrase fails to arc-fit even after shrink, secondary succeeds on the first attempt — confirm the retry actually fires (not skipped due to secondary's early success), confirm primary ultimately renders via straight-line fallback, confirm both `*Applied` flags are `true` and `primaryUsedFallback` is `true`.
- **Shrink-alone-resolves-both case:** a fixture where both phrases fail to arc-fit on the original art but both succeed after the shrink retry — proves the retry-trigger fix alone resolves the common case without needing the straight-line fallback.
- **Both-fail-even-after-shrink case:** an extreme fixture (very long primary and secondary) forcing straight-line fallback for both — confirms the last-resort path and its flags.
- **No-secondary-phrase case:** confirms `secondaryOverlayApplied`/`secondaryUsedFallback` report `null`, not `false`, when no secondary phrase was requested — matching `overlayApplied`'s existing convention.
- **Rectangular-shape regression:** existing `applyTextOverlay`/`applyTextOverlayWithFallback` rectangular tests updated only for the new return shape (`.buffer` instead of a bare `Buffer`) — no behavioral changes expected, flags should read `true`/`true` (or `null` for secondary) in the already-passing cases.

Existing tests in `textOverlay.test.ts` (`applyTextOverlay`, `applyTextOverlayWithFallback` describe blocks) need updating for the new return shape but not new logic, aside from the new fixtures above. `route.ts`-level tests (if any) need updating to read `.buffer` and the new Firestore fields.

## Decisions Made

- **Fix the retry trigger's condition, not the shrink mechanism itself** — `shrinkArtForTextZone`'s `center`-anchor-when-secondary-present logic already correctly targets this exact scenario; the bug is purely that it wasn't being reached.
- **Straight-line fallback as the true last resort, not a first-choice alternative to arcing** — matches user's explicit choice; only invoked after both the natural attempt and the shrink retry have failed for a given phrase, keeping the visually-preferred arced style as the default whenever it can legibly fit.
- **Rich typed return object (`OverlayResult`) over a callback or side-channel log** — matches this codebase's existing style (e.g. `ColorPair` from the color-strategy work) and gives the caller an explicit, inspectable signal rather than an implicit one inferred from thrown warnings or buffer diffing.
- **New Firestore fields added alongside `overlayApplied`, not replacing it** — avoids any migration/backward-compatibility work for existing consumers of that field; the new fields are purely additive.
- **No generalized N-phrase system** — YAGNI; this design only ever has two phrase slots.

## Open Items for Planning

1. Confirm whether any other caller besides `apps/frontend/src/app/api/n8n/create-asset/route.ts` uses `applyTextOverlay`/`applyTextOverlayWithFallback` directly (expected: no, based on this session's exploration, but worth a repo-wide grep during planning to be certain).
2. Decide the exact TypeScript typing for the `null`-vs-`boolean` fields on the Firestore asset doc — whether `AssetDoc`-style shared types exist in `src/lib/types.ts` that need updating alongside the route change.
3. No performance concern expected — the straight-line fallback path only executes as a rare last resort (both natural and shrink-retry arc attempts already failed), and reuses existing rendering primitives at no new cost.
