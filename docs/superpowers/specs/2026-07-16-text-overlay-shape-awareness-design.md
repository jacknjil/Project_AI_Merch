# Text-Overlay Shape Awareness — Design

**Date:** 2026-07-16
**Status:** Approved, ready for planning

## Problem

`apps/frontend/src/lib/textOverlay.ts` has no concept of art shape. Every phrase is rendered as straight, word-wrapped horizontal text in a rectangular zone above the art (`getArtBoundingBox` + `computeTextZone`). When Recraft generates full-bleed circular/badge-style art (a round button design, a badge, a seal), there's no natural margin for a straight banner, so `shrinkArtForTextZone` shrinks the art 25% and bottom-anchors it — leaving an awkward dead-space gap between the title band and the art, instead of text that wraps around the badge's rim the way real patch/badge designs look.

This was confirmed as the user's #1 remaining concern after live-verifying the font/color aesthetic-matching fix (see `2026-07-15-text-overlay-aesthetic-matching-design.md` and memory `project_text_overlay_shape_awareness_gap`).

## Goal

Detect when generated art is circular/badge-shaped, and render the phrase as a top arc that follows the badge's curve, instead of falling back to the shrink-and-straight-line approach. Non-circular art (the common case) is entirely unaffected.

## Architecture & Data Flow

```
route.ts
  → resolveOverlayStyle(png, { colorPalette, styleTag })   [textOverlayStyling.ts]
      → classifyFontCategory(png, ctx)   [artStyleAnalysis.ts, EXTENDED]
          one GPT-4o call now returns { fontCategory, shape }
          instead of just fontCategory — same image, same request
      → colorExtraction (unchanged)
    returns { fontBuffer, fill, stroke, shape }   ← shape is new
  → applyTextOverlayWithFallback(png, phrase, fontBuffer, colors, shape)   [textOverlay.ts, EXTENDED]
      shape === 'circular'  → renderArcedTextToSvg()  (new)
      shape === 'rectangular' → renderTextToSvg()  (unchanged, today's path)
      if arced text overflows even at min size →
          shrinkArtForTextZone() + renderTextToSvg()  (today's existing fallback, unchanged)
```

## Decisions

- **Detection method: extend the existing GPT-4o vision call.** `artStyleAnalysis.ts` already sends the image to GPT-4o once per asset for font classification. Rather than a second API call or a pixel-geometry heuristic (alpha-mask fill-ratio), the same call now returns both `fontCategory` and `shape` in one JSON response. Zero extra latency/cost, and vision naturally handles ambiguous shapes that a pixel heuristic would misjudge.
- **Shape enum: binary — `'circular' | 'rectangular'`.** Matches the one concrete problem named and the one new render path being built. Shields/other odd shapes fall into `'rectangular'` and keep today's straight-line behavior — no worse than today. A broader enum was explicitly rejected as speculative generality (no render path would exist yet for the extra categories).
- **Curve layout: top arc only**, not full-circumference wrap. Text curves along the top portion of the circle's rim (classic patch-design look), reusing most of the existing zone/fallback logic — only the glyph-layout function changes (arc instead of straight baseline).
- **Arc radius: fixed proportion of the existing text zone's width**, not derived from the art's actual detected circle geometry. Same category of formula as today's `maxWidth`/`maxHeight`-based font-size scaling in `renderTextToSvg` — no new geometry-detection step, no new failure mode.
- **When to use the arc: always, for any `circular`-classified asset** — not merely as a second-tier fallback. This is the correct default look for that shape; rectangular/shield assets are completely unchanged.
- **Arc overflow: fall back to today's `shrinkArtForTextZone` + straight-line path.** If a phrase can't render legibly along the arc even at minimum size, the existing shrink-and-straight fallback (already in `applyTextOverlayWithFallback`) becomes a third tier. No new failure mode is introduced — worst case for a circular asset with an extra-long phrase looks exactly like it does today.

### Addendum (2026-07-16, post-implementation live testing): shrink-first for circular shapes

Live-testing Task 6 against a real Recraft-generated circular badge surfaced a gap in the "arc overflow" decision above: Recraft's well-documented near-full-bleed generation habit (see the existing `shrinkArtForTextZone` comment — "~4% top clearance on real generations") means a *natural* zone (positive height/width before any shrinking) essentially never exists for circular assets in practice. Since `applyTextOverlay`'s `zone.height <= 0` check fires before the `shape` branch is ever consulted, this meant the arc renderer was skipped almost every time in production, and circular assets fell straight to the pre-existing shrink+straight-line fallback — the exact dead-space-gap problem this feature was built to fix. Confirmed via direct reproduction: `renderArcedTextToSvg` itself renders a correct, clearly-curved SVG (~44° arc span) when given the actual zone dimensions from the live run; the gap was purely in when the arc gets a chance to run, not in the arc math.

**Revised decision:** for `circular` shape, `applyTextOverlayWithFallback` now shrinks the art *unconditionally as a first-class step* (same as today, 25%) whenever the natural zone doesn't work, and *retries the arc renderer on the shrunk art* before ever falling to straight-line text. Only if the arc still doesn't fit on the shrunk art (either no room or `ArcTextTooSmallError` again) does it fall through to straight-line text on the shrunk art — the original ultimate safety net, unchanged in behavior and still guaranteeing no new failure mode beyond what exists today. `rectangular` shape is completely unaffected by this change.

## Component Changes

1. **`artStyleAnalysis.ts`** — `classifyFontCategory` becomes a combined classifier. The GPT-4o prompt asks for a small JSON object (`{fontCategory, shape}`) instead of a bare category string. `shape` is validated against `'circular' | 'rectangular'` the same way `isFontCategory` validates today; on invalid/missing shape or any API failure, default to `'rectangular'` (today's behavior, unchanged) — same safe-default convention as the existing `DEFAULT_CATEGORY` fallback.

2. **`textRender.ts`** — new `renderArcedTextToSvg(font, text, options)`, a sibling to `renderTextToSvg`. Since glyphs come from `opentype.js` path outlines (not native SVG `<text>`), curving means laying out each character individually: walk the string, accumulate advance widths to get each glyph's angular position along a computed arc, then position + rotate each glyph's path onto that arc (standard circular-text-layout algorithm). Radius follows the fixed-proportion-of-zone-width formula above, reusing the same `maxWidth`/`maxHeight` scaling logic as today's straight renderer.

3. **`textOverlay.ts`** — `applyTextOverlayWithFallback` gains a `shape` parameter and branches to the arced renderer for `'circular'`. Per the addendum above, on overflow it shrinks the art and retries the arc *before* falling through to the existing straight-line fallback (only used if the arc still doesn't fit on the shrunk art).

4. **`textOverlayStyling.ts`** — `resolveOverlayStyle`'s return type gains `shape`, threaded straight through from `classifyFontCategory`.

5. **`route.ts`** — one extra field passed from `overlayStyle` into the overlay call; no new orchestration logic.

## Error Handling

Every new failure mode degrades to something that already exists today:
- Vision-call failure → `shape: 'rectangular'` (today's only path, unchanged).
- Arc-overflow → today's shrink+straight fallback (already exists, now one tier deeper).

No new user-facing failure mode is introduced.

## Testing

- **Unit tests (vitest)**, matching existing patterns in `artStyleAnalysis.test.ts` / `textOverlay.test.ts`:
  - Shape classification: valid passthrough, invalid value falls back to `rectangular`, API throw falls back to `rectangular`.
  - `renderArcedTextToSvg`: produces valid SVG, respects `maxWidth`/`maxHeight`, curvature matches the radius formula.
  - Orchestration branching: `circular` → arc path used, `rectangular` → unchanged straight path, arc-overflow → triggers existing shrink fallback.
- **Live visual verification**: an `ops/*.mjs` prototype script (same pattern as the font/color work's Task 7 — `ops/text-overlay-prototype.mjs`) run against a real circular Recraft asset, eyeballed via the Read tool before shipping. Curved glyph geometry is exactly the kind of thing that can look correct in unit-test numbers but wrong to the eye.

## Explicit Scope Boundaries (out of scope)

- No retroactive reprocessing of already-generated assets (matches the font/color feature's precedent — no source art is retained).
- No full-circumference wrap, no shield/other-shape-specific curves — only top-arc-for-circular. Future work if the binary distinction proves insufficient.
- No Google Sheet/schema changes — shape is inferred purely from the vision call, not sourced from sheet columns.
