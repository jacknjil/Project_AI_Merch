# Two-Phrase Text Overlay Fallback & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `applyTextOverlayWithFallback` so a two-phrase request either renders both phrases or falls back to straight-line text for whichever one genuinely can't fit — never silently ships with one phrase missing while reporting success — and make that outcome visible in Firestore.

**Architecture:** `applyTextOverlay`/`applyTextOverlayWithFallback` (`apps/frontend/src/lib/textOverlay.ts`) change return type from `Promise<Buffer>` to `Promise<OverlayResult>`, a small typed object carrying the rendered buffer plus per-phrase applied/fallback flags. `applyTextOverlayWithFallback`'s two existing whole-buffer-equality retry gates are replaced with per-phrase-applied checks, and its final step (currently a whole-shape switch from circular to rectangular) becomes a targeted straight-line render of only whichever phrase(s) are still missing. `route.ts` is the only caller outside the lib itself (confirmed via repo-wide grep) and updates to unpack `.buffer` and write four new Firestore fields alongside the existing `overlayApplied`.

**Tech Stack:** TypeScript, `sharp`, `opentype.js` (via existing `textRender.ts`), Vitest.

## Global Constraints

- No change to arc-fit math (`MIN_ARC_FONT_SIZE`, `MAX_ARC_ANGLE`, `ARC_RADIUS_SLACK`) in `textRender.ts` — this plan is control-flow only.
- No change to `shrinkArtForTextZone`'s scale/anchor logic — reused as-is.
- No change to how `n8n`/the Google Sheet resolves `phrase`/`phraseSecondary` — app-side rendering pipeline only.
- Rectangular-shape pixel output must be byte-identical to today's for every existing passing test — it was never affected by this bug class.
- New Firestore fields are additive; the existing `overlayApplied` field's meaning and existing consumers are unchanged.
- `apps/frontend/src/lib/types.ts`'s `Asset` interface does not currently declare `overlayApplied` or `phraseSecondary` even though `route.ts` writes both — confirmed the n8n asset-creation write path isn't typed against a shared interface, so no `types.ts` changes are needed for this plan (resolves spec Open Item #2).
- `route.ts` has no existing test file (confirmed: no `route.test.ts` in `src/app/api/n8n/create-asset/`) and building one from scratch is out of scope for this bug fix (YAGNI) — Task 3's verification is `tsc --noEmit` + `eslint` + the full existing suite passing, not a new test suite.

---

### Task 1: Add `OverlayResult` type; update `applyTextOverlay` to return it with accurate per-phrase flags

**Files:**
- Modify: `apps/frontend/src/lib/textOverlay.ts` (add `OverlayResult` interface; change `applyTextOverlay`'s signature and both its circular/rectangular branch bodies)
- Modify: `apps/frontend/src/lib/textOverlay.test.ts` (`applyTextOverlay` describe block, lines ~184-397)

**Interfaces:**
- Consumes: nothing new — `ArcTextTooSmallError`, `renderTextToSvg`, `renderArcedTextToSvg` from `textRender.ts` (unchanged imports).
- Produces:
  ```ts
  export interface OverlayResult {
    buffer: Buffer;
    primaryApplied: boolean;
    secondaryApplied: boolean;
    primaryUsedFallback: boolean;
    secondaryUsedFallback: boolean;
  }
  ```
  `applyTextOverlay(...): Promise<OverlayResult>`. `primaryUsedFallback`/`secondaryUsedFallback` are **always `false`** from this function — `applyTextOverlay` only ever attempts each phrase's "natural" rendering (arced for circular, straight for rectangular); the straight-line-as-last-resort-for-a-failed-arc concept belongs entirely to Task 2's `applyTextOverlayWithFallback`.

- [ ] **Step 1: Write the failing tests for the new return shape and flags**

Replace the entire `describe('applyTextOverlay', ...)` block (lines 184-397) with the version below. This is a mechanical transformation of every existing assertion (`output.equals(X)` → `output.buffer.equals(X)`, `circular.equals(straight)` → `circular.buffer.equals(straight.buffer)`, etc. — apply this rule to every pre-existing assertion in the block) plus two net-new tests at the end using row 326's real measured geometry (canvas 1024×1024; `artBox` `{left:153, top:147, width:726, height:733}`; `marginPx=41`; the exact numbers verified directly against the real production asset that surfaced this bug, not hand-predicted):

```typescript
describe('applyTextOverlay', () => {
  it('composites text above the art and preserves canvas dimensions', async () => {
    const opaqueArt = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const canvas = await sharp({
      create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: opaqueArt, left: 150, top: 400 }])
      .png()
      .toBuffer();

    const output = await applyTextOverlay(canvas, 'ESPRESSO YOURSELF', fontBuffer);
    const meta = await sharp(output.buffer).metadata();
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(800);
    expect(meta.hasAlpha).toBe(true);
    expect(output.buffer.equals(canvas)).toBe(false);
    expect(output.primaryApplied).toBe(true);
    expect(output.secondaryApplied).toBe(false);
    expect(output.primaryUsedFallback).toBe(false);
  });

  it('returns the original buffer unchanged and primaryApplied false when there is no room for text', async () => {
    const canvas = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const output = await applyTextOverlay(canvas, 'ESPRESSO YOURSELF', fontBuffer);
    expect(output.buffer.equals(canvas)).toBe(true);
    expect(output.primaryApplied).toBe(false);
  });

  it('uses the provided fill and stroke colors instead of the defaults', async () => {
    const canvas = await sharp({
      create: { width: 1000, height: 1000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{
        input: await sharp({ create: { width: 900, height: 700, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(),
        left: 50, top: 250,
      }])
      .png().toBuffer();

    const withCustomColors = await applyTextOverlay(canvas, 'HI', fontBuffer, { fill: '#123456', stroke: '#ABCDEF' });
    const withDefaults = await applyTextOverlay(canvas, 'HI', fontBuffer);

    expect(withCustomColors.buffer.equals(withDefaults.buffer)).toBe(false);
  });

  it('renders visually different output for a circular shape than the default straight rendering', async () => {
    const canvas = await sharp({
      create: { width: 1000, height: 1000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{
        input: await sharp({ create: { width: 900, height: 700, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(),
        left: 50, top: 250,
      }])
      .png().toBuffer();

    const circular = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular');
    const straight = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular');

    expect(circular.buffer.equals(straight.buffer)).toBe(false);
  });

  it('returns the original buffer unchanged and primaryApplied false when circular text cannot fit above the minimum legible arc size', async () => {
    const opaqueArt = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const canvas = await sharp({
      create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: opaqueArt, left: 150, top: 400 }])
      .png()
      .toBuffer();

    const longPhrase = 'THIS PHRASE IS DEFINITELY WAY TOO LONG TO CURVE LEGIBLY IN THIS SPACE';
    const output = await applyTextOverlay(canvas, longPhrase, fontBuffer, {}, 'circular');
    expect(output.buffer.equals(canvas)).toBe(true);
    expect(output.primaryApplied).toBe(false);
  });

  describe('secondaryPhrase', () => {
    async function canvasWithRoomOnBothSides() {
      const opaqueArt = await sharp({
        create: { width: 700, height: 500, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
      }).png().toBuffer();

      return sharp({
        create: { width: 1000, height: 1000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: opaqueArt, left: 150, top: 150 }])
        .png()
        .toBuffer();
    }

    it('omitting secondaryPhrase produces identical output to today (regression guard)', async () => {
      const canvas = await canvasWithRoomOnBothSides();
      const withoutArg = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular');
      const withUndefined = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular', undefined);
      expect(withoutArg.buffer.equals(withUndefined.buffer)).toBe(true);
      expect(withoutArg.secondaryApplied).toBe(false);
    });

    it('composites a visibly different result when a fitting secondaryPhrase is provided, for a circular shape', async () => {
      const canvas = await canvasWithRoomOnBothSides();
      const primaryOnly = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular');
      const withSecondary = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular', 'BYE');
      expect(withSecondary.buffer.equals(primaryOnly.buffer)).toBe(false);
      expect(withSecondary.buffer.equals(canvas)).toBe(false);
      expect(withSecondary.primaryApplied).toBe(true);
      expect(withSecondary.secondaryApplied).toBe(true);
    });

    it('composites a visibly different result when a fitting secondaryPhrase is provided, for a rectangular shape', async () => {
      const canvas = await canvasWithRoomOnBothSides();
      const primaryOnly = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular');
      const withSecondary = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular', 'BYE');
      expect(withSecondary.buffer.equals(primaryOnly.buffer)).toBe(false);
      expect(withSecondary.buffer.equals(canvas)).toBe(false);
      expect(withSecondary.secondaryApplied).toBe(true);
    });

    it('omitting secondaryPhrase produces identical output to today for a rectangular shape (regression guard)', async () => {
      const canvas = await canvasWithRoomOnBothSides();
      const withoutArg = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular');
      const withUndefined = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular', undefined);
      expect(withoutArg.buffer.equals(withUndefined.buffer)).toBe(true);
    });

    it('renders primary only, without throwing, when there is no room below the art for a rectangular secondary phrase', async () => {
      const opaqueArt = await sharp({
        create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
      }).png().toBuffer();

      const canvas = await sharp({
        create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: opaqueArt, left: 150, top: 470 }])
        .png()
        .toBuffer();

      const primaryOnly = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular');
      const withSecondary = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular', 'BYE');
      expect(withSecondary.buffer.equals(primaryOnly.buffer)).toBe(true);
      expect(withSecondary.secondaryApplied).toBe(false);
    });

    it('falls back to primary-only output when secondaryPhrase cannot fit, without throwing', async () => {
      const opaqueArt = await sharp({
        create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
      }).png().toBuffer();

      const canvas = await sharp({
        create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: opaqueArt, left: 150, top: 400 }])
        .png()
        .toBuffer();

      const longSecondary = 'THIS SECONDARY PHRASE IS DEFINITELY WAY TOO LONG TO CURVE LEGIBLY IN THIS TINY SPACE';
      const primaryOnly = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular');
      const withUnfittingSecondary = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular', longSecondary);
      expect(withUnfittingSecondary.buffer.equals(primaryOnly.buffer)).toBe(true);
      expect(withUnfittingSecondary.secondaryApplied).toBe(false);
    });

    it('actually renders a visible secondary phrase on a near-full-bleed circular badge, by centering the shrunk art instead of anchoring it to the bottom', async () => {
      const canvasSize = 1024;
      const artDiameter = Math.round(canvasSize * 0.96);
      const artOffset = Math.round((canvasSize - artDiameter) / 2);

      const circleSvg = `<svg width="${artDiameter}" height="${artDiameter}"><circle cx="${artDiameter / 2}" cy="${artDiameter / 2}" r="${artDiameter / 2}" fill="rgb(120,80,40)"/></svg>`;
      const circleArt = await sharp(Buffer.from(circleSvg)).png().toBuffer();

      const canvas = await sharp({
        create: { width: canvasSize, height: canvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: circleArt, left: artOffset, top: artOffset }])
        .png()
        .toBuffer();

      const primaryOnly = await applyTextOverlayWithFallback(canvas, 'WANDERLUST', fontBuffer, {}, 0.75, 'circular');
      const withSecondary = await applyTextOverlayWithFallback(
        canvas,
        'WANDERLUST',
        fontBuffer,
        {},
        0.75,
        'circular',
        'ADVENTURE AWAITS',
      );

      expect(withSecondary.buffer.equals(canvas)).toBe(false);
      expect(withSecondary.buffer.equals(primaryOnly.buffer)).toBe(false);

      const centeredArt = await shrinkArtForTextZone(canvas, 0.75, 'center');
      const artBox = await getArtBoundingBox(centeredArt);
      const roomAbove = artBox.top;
      const roomBelow = canvasSize - (artBox.top + artBox.height);
      expect(roomBelow).toBeGreaterThan(50);
      expect(roomBelow).toBeCloseTo(roomAbove, -1);
    });
  });

  describe('row 326 real-world geometry (regression: primary silently dropped while secondary succeeded)', () => {
    // Canvas and artBox measured directly against the real production asset
    // that surfaced this bug (Firestore doc assets/pXzADDbM9AAFabsVFdP6,
    // "Opossum's Almanac", rowId 326) -- a synthetic opaque rectangle at the
    // exact same bounds reproduces the identical zone/radius geometry, since
    // the arc-fit math depends only on canvas/artBox dimensions and phrase
    // content, never on the art's actual pixel colors.
    async function row326Geometry() {
      const opaqueArt = await sharp({
        create: { width: 726, height: 733, channels: 4, background: { r: 120, g: 90, b: 60, alpha: 1 } },
      }).png().toBuffer();

      return sharp({
        create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: opaqueArt, left: 153, top: 147 }])
        .png()
        .toBuffer();
    }

    it('drops the primary phrase (too long to arc-fit) but keeps the secondary (fits), reporting accurate per-phrase flags', async () => {
      const canvas = await row326Geometry();
      const output = await applyTextOverlay(
        canvas,
        "Nature's Little Necromancer",
        fontBuffer,
        {},
        'circular',
        'Reader of the Woods',
      );

      expect(output.primaryApplied).toBe(false);
      expect(output.secondaryApplied).toBe(true);
      expect(output.primaryUsedFallback).toBe(false);
      expect(output.secondaryUsedFallback).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlay.test.ts`
Expected: FAIL — `applyTextOverlay` still returns a bare `Buffer`, so `.buffer`/`.primaryApplied`/etc. are all `undefined`, and TypeScript compilation itself should also fail on the `.buffer` accesses (confirms the tests are actually exercising the new shape, not passing vacuously).

- [ ] **Step 3: Implement `OverlayResult` and update `applyTextOverlay`**

In `apps/frontend/src/lib/textOverlay.ts`, add the interface near the top (after `OverlayColors`):

```ts
export interface OverlayResult {
  buffer: Buffer;
  primaryApplied: boolean;
  secondaryApplied: boolean;
  primaryUsedFallback: boolean;
  secondaryUsedFallback: boolean;
}
```

Replace the `applyTextOverlay` function body with:

```ts
export async function applyTextOverlay(
  artBuffer: Buffer,
  phrase: string,
  fontBuffer: Buffer,
  colors: OverlayColors = {},
  shape: ArtShape = 'rectangular',
  secondaryPhrase?: string,
): Promise<OverlayResult> {
  const meta = await sharp(artBuffer).metadata();
  const canvasWidth = meta.width ?? 0;
  const canvasHeight = meta.height ?? 0;

  const artBox = await getArtBoundingBox(artBuffer);
  const marginPx = Math.round(Math.min(canvasWidth, canvasHeight) * 0.04);
  const zone = computeTextZone(canvasWidth, canvasHeight, artBox, marginPx);

  const noResult = (): OverlayResult => ({
    buffer: artBuffer,
    primaryApplied: false,
    secondaryApplied: false,
    primaryUsedFallback: false,
    secondaryUsedFallback: false,
  });

  if (zone.height <= 0 || zone.width <= 0) return noResult();

  const font = loadFont(fontBuffer);
  const renderOptions = {
    maxWidth: zone.width,
    maxHeight: zone.height,
    fill: colors.fill,
    stroke: colors.stroke,
  };

  if (shape === 'circular') {
    const badgeRadius = ((artBox.width + artBox.height) / 4) * ARC_RADIUS_SLACK;
    const badgeCenterX = artBox.left + artBox.width / 2;

    let withPrimary: Buffer = artBuffer;
    let primaryApplied = false;
    try {
      const rendered = renderArcedTextToSvg(font, phrase, { ...renderOptions, radius: badgeRadius });
      const textPng = await sharp(rendered.svg).png().toBuffer();
      withPrimary = await compositeArcedTextOverArt(
        artBuffer,
        textPng,
        { x: badgeCenterX, y: artBox.top },
        { x: rendered.anchorX, y: rendered.anchorY },
      );
      primaryApplied = true;
    } catch (err) {
      if (!(err instanceof ArcTextTooSmallError)) throw err;
    }

    if (!secondaryPhrase) {
      return { buffer: withPrimary, primaryApplied, secondaryApplied: false, primaryUsedFallback: false, secondaryUsedFallback: false };
    }

    try {
      const bottomZone = computeBottomTextZone(canvasWidth, canvasHeight, artBox, marginPx);
      const renderedSecondary = renderArcedTextToSvg(font, secondaryPhrase, {
        maxWidth: bottomZone.width,
        maxHeight: bottomZone.height,
        fill: colors.fill,
        stroke: colors.stroke,
        radius: badgeRadius,
        direction: 'bottom',
      });
      const secondaryPng = await sharp(renderedSecondary.svg).png().toBuffer();
      const withBoth = await compositeArcedTextOverArt(
        withPrimary,
        secondaryPng,
        { x: badgeCenterX, y: artBox.top + artBox.height },
        { x: renderedSecondary.anchorX, y: renderedSecondary.anchorY },
      );
      return { buffer: withBoth, primaryApplied, secondaryApplied: true, primaryUsedFallback: false, secondaryUsedFallback: false };
    } catch (err) {
      if (!(err instanceof ArcTextTooSmallError)) throw err;
      return { buffer: withPrimary, primaryApplied, secondaryApplied: false, primaryUsedFallback: false, secondaryUsedFallback: false };
    }
  }

  const rendered = renderTextToSvg(font, phrase, renderOptions);
  const textPng = await sharp(rendered.svg).png().toBuffer();
  const withPrimary = await compositeTextOverArt(artBuffer, textPng, zone);

  if (!secondaryPhrase) {
    return { buffer: withPrimary, primaryApplied: true, secondaryApplied: false, primaryUsedFallback: false, secondaryUsedFallback: false };
  }

  const bottomZone = computeBottomTextZone(canvasWidth, canvasHeight, artBox, marginPx);
  if (bottomZone.height <= 0 || bottomZone.width <= 0) {
    return { buffer: withPrimary, primaryApplied: true, secondaryApplied: false, primaryUsedFallback: false, secondaryUsedFallback: false };
  }

  const renderedSecondary = renderTextToSvg(font, secondaryPhrase, {
    maxWidth: bottomZone.width,
    maxHeight: bottomZone.height,
    fill: colors.fill,
    stroke: colors.stroke,
  });
  const secondaryPng = await sharp(renderedSecondary.svg).png().toBuffer();
  const withBoth = await compositeTextOverArt(withPrimary, secondaryPng, bottomZone);
  return { buffer: withBoth, primaryApplied: true, secondaryApplied: true, primaryUsedFallback: false, secondaryUsedFallback: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlay.test.ts`
Expected: all `applyTextOverlay` tests PASS. The `applyTextOverlayWithFallback` describe block will still fail to compile at this point (it calls `applyTextOverlay` and still expects a bare `Buffer`) — that's expected and fixed in Task 2. Confirm specifically that `describe('applyTextOverlay', ...)` tests are green: `npx vitest run src/lib/textOverlay.test.ts -t "applyTextOverlay"`.

- [ ] **Step 5: Commit**

```bash
cd apps/frontend
git add src/lib/textOverlay.ts src/lib/textOverlay.test.ts
git commit -m "feat: return per-phrase applied flags from applyTextOverlay

Row 326 shipped with its primary phrase silently dropped while the
secondary succeeded, and overlayApplied read true regardless. Step one:
applyTextOverlay now returns an OverlayResult with primaryApplied/
secondaryApplied instead of a bare Buffer, so a failed arc is visible to
the caller instead of indistinguishable from success."
```

---

### Task 2: Fix `applyTextOverlayWithFallback`'s retry gates and add per-phrase straight-line fallback

**Files:**
- Modify: `apps/frontend/src/lib/textOverlay.ts` (`applyTextOverlayWithFallback` function body)
- Modify: `apps/frontend/src/lib/textOverlay.test.ts` (`applyTextOverlayWithFallback` describe block, lines ~399-462)

**Interfaces:**
- Consumes: `OverlayResult`, `applyTextOverlay(...): Promise<OverlayResult>` from Task 1.
- Produces: `applyTextOverlayWithFallback(...): Promise<OverlayResult>` — same shape, now with `primaryUsedFallback`/`secondaryUsedFallback` meaningfully `true` when the straight-line last resort actually fired.

- [ ] **Step 1: Write the failing tests**

Replace the `describe('applyTextOverlayWithFallback', ...)` block with:

```typescript
describe('applyTextOverlayWithFallback', () => {
  it('shrinks and retries when the natural bounding box leaves no room for text', async () => {
    const uniform = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const output = await applyTextOverlayWithFallback(uniform, 'ESPRESSO YOURSELF', fontBuffer);
    const meta = await sharp(output.buffer).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
    expect(output.buffer.equals(uniform)).toBe(false);
    expect(output.primaryApplied).toBe(true);
  });

  it('uses the natural bounding box directly when there is already room', async () => {
    const opaqueArt = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const canvas = await sharp({
      create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: opaqueArt, left: 150, top: 400 }])
      .png()
      .toBuffer();

    const withFallback = await applyTextOverlayWithFallback(canvas, 'ESPRESSO YOURSELF', fontBuffer);
    const direct = await applyTextOverlay(canvas, 'ESPRESSO YOURSELF', fontBuffer);
    expect(withFallback.buffer.equals(direct.buffer)).toBe(true);
  });

  it('falls back to shrink + straight-line rendering for the primary phrase when circular text overflows even after shrinking', async () => {
    const opaqueArt = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const canvas = await sharp({
      create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: opaqueArt, left: 150, top: 400 }])
      .png()
      .toBuffer();

    const longPhrase = 'THIS PHRASE IS DEFINITELY WAY TOO LONG TO CURVE LEGIBLY IN THIS SPACE';
    const withFallback = await applyTextOverlayWithFallback(canvas, longPhrase, fontBuffer, {}, 0.75, 'circular');

    const shrunk = await shrinkArtForTextZone(canvas, 0.75);
    const expectedFallbackOutput = await applyTextOverlay(shrunk, longPhrase, fontBuffer, {}, 'rectangular');

    expect(withFallback.buffer.equals(canvas)).toBe(false);
    expect(withFallback.buffer.equals(expectedFallbackOutput.buffer)).toBe(true);
    expect(withFallback.primaryApplied).toBe(true);
    expect(withFallback.primaryUsedFallback).toBe(true);
  });

  it('shrinks then successfully renders arced text on the shrunk art when the natural zone does not exist', async () => {
    const uniform = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const withFallback = await applyTextOverlayWithFallback(uniform, 'HI', fontBuffer, {}, 0.75, 'circular');

    const shrunk = await shrinkArtForTextZone(uniform, 0.75);
    const straightOnShrunk = await applyTextOverlay(shrunk, 'HI', fontBuffer, {}, 'rectangular');

    expect(withFallback.buffer.equals(uniform)).toBe(false);
    expect(withFallback.buffer.equals(straightOnShrunk.buffer)).toBe(false);
    expect(withFallback.primaryUsedFallback).toBe(false);
  });

  describe('row 326 real-world geometry (regression: the actual reported bug)', () => {
    async function row326Geometry() {
      const opaqueArt = await sharp({
        create: { width: 726, height: 733, channels: 4, background: { r: 120, g: 90, b: 60, alpha: 1 } },
      }).png().toBuffer();

      return sharp({
        create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: opaqueArt, left: 153, top: 147 }])
        .png()
        .toBuffer();
    }

    it('retries with shrink and renders BOTH phrases via arc when the primary fails but the secondary already succeeded (the exact row 326 bug)', async () => {
      const canvas = await row326Geometry();

      const direct = await applyTextOverlay(
        canvas,
        "Nature's Little Necromancer",
        fontBuffer,
        {},
        'circular',
        'Reader of the Woods',
      );
      expect(direct.primaryApplied).toBe(false);
      expect(direct.secondaryApplied).toBe(true);

      const output = await applyTextOverlayWithFallback(
        canvas,
        "Nature's Little Necromancer",
        fontBuffer,
        {},
        0.75,
        'circular',
        'Reader of the Woods',
      );

      expect(output.primaryApplied).toBe(true);
      expect(output.secondaryApplied).toBe(true);
      expect(output.primaryUsedFallback).toBe(false);
      expect(output.secondaryUsedFallback).toBe(false);
      expect(output.buffer.equals(canvas)).toBe(false);
    });

    it('falls back to straight-line text for both phrases when even the shrunk art cannot fit either arc', async () => {
      const canvas = await row326Geometry();
      const extremePrimary = 'This Is An Extremely Long Title That Will Never Fit On A Small Circular Badge No Matter What';
      const extremeSecondary = 'And Neither Will This Equally Long Secondary Tagline Underneath It Either';

      const output = await applyTextOverlayWithFallback(
        canvas,
        extremePrimary,
        fontBuffer,
        {},
        0.75,
        'circular',
        extremeSecondary,
      );

      expect(output.primaryApplied).toBe(true);
      expect(output.secondaryApplied).toBe(true);
      expect(output.primaryUsedFallback).toBe(true);
      expect(output.secondaryUsedFallback).toBe(true);
      expect(output.buffer.equals(canvas)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlay.test.ts -t "applyTextOverlayWithFallback"`
Expected: FAIL — the row 326 regression test fails because today's `if (!output.equals(artBuffer)) return output;` returns early on the original attempt (secondary succeeded), never retrying; `.primaryApplied` stays `false` in the final result.

- [ ] **Step 3: Implement the retry-gate fix and straight-line fallback**

Replace `applyTextOverlayWithFallback`'s body in `apps/frontend/src/lib/textOverlay.ts`:

```ts
function bothSucceeded(result: OverlayResult, secondaryPhrase?: string): boolean {
  return result.primaryApplied && (secondaryPhrase ? result.secondaryApplied : true);
}

async function straightLineFallbackFor(
  buffer: Buffer,
  phrase: string,
  fontBuffer: Buffer,
  colors: OverlayColors,
  zoneKind: 'top' | 'bottom',
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const canvasWidth = meta.width ?? 0;
  const canvasHeight = meta.height ?? 0;
  const artBox = await getArtBoundingBox(buffer);
  const marginPx = Math.round(Math.min(canvasWidth, canvasHeight) * 0.04);
  const zone = zoneKind === 'top'
    ? computeTextZone(canvasWidth, canvasHeight, artBox, marginPx)
    : computeBottomTextZone(canvasWidth, canvasHeight, artBox, marginPx);

  if (zone.height <= 0 || zone.width <= 0) return buffer;

  const font = loadFont(fontBuffer);
  const rendered = renderTextToSvg(font, phrase, {
    maxWidth: zone.width,
    maxHeight: zone.height,
    fill: colors.fill,
    stroke: colors.stroke,
  });
  const textPng = await sharp(rendered.svg).png().toBuffer();
  return compositeTextOverArt(buffer, textPng, zone);
}

export async function applyTextOverlayWithFallback(
  artBuffer: Buffer,
  phrase: string,
  fontBuffer: Buffer,
  colors: OverlayColors = {},
  shrinkScale = 0.75,
  shape: ArtShape = 'rectangular',
  secondaryPhrase?: string,
): Promise<OverlayResult> {
  const attempt1 = await applyTextOverlay(artBuffer, phrase, fontBuffer, colors, shape, secondaryPhrase);
  if (bothSucceeded(attempt1, secondaryPhrase)) return attempt1;

  const shrunk = await shrinkArtForTextZone(artBuffer, shrinkScale, secondaryPhrase ? 'center' : 'bottom');

  if (shape !== 'circular') {
    return applyTextOverlay(shrunk, phrase, fontBuffer, colors, 'rectangular', secondaryPhrase);
  }

  const attempt2 = await applyTextOverlay(shrunk, phrase, fontBuffer, colors, 'circular', secondaryPhrase);
  if (bothSucceeded(attempt2, secondaryPhrase)) return attempt2;

  // Circular shape, still missing at least one phrase after the shrink
  // retry -- straight-line last resort, applied only to whichever phrase(s)
  // are still missing, so a phrase that already succeeded (arced or not)
  // is never re-rendered or degraded.
  let buffer = attempt2.buffer;
  let primaryApplied = attempt2.primaryApplied;
  let secondaryApplied = attempt2.secondaryApplied;
  let primaryUsedFallback = false;
  let secondaryUsedFallback = false;

  if (!primaryApplied) {
    const before = buffer;
    buffer = await straightLineFallbackFor(buffer, phrase, fontBuffer, colors, 'top');
    primaryApplied = !buffer.equals(before);
    primaryUsedFallback = primaryApplied;
  }

  if (secondaryPhrase && !secondaryApplied) {
    const before = buffer;
    buffer = await straightLineFallbackFor(buffer, secondaryPhrase, fontBuffer, colors, 'bottom');
    secondaryApplied = !buffer.equals(before);
    secondaryUsedFallback = secondaryApplied;
  }

  return { buffer, primaryApplied, secondaryApplied, primaryUsedFallback, secondaryUsedFallback };
}
```

Note: the `shape !== 'circular'` (rectangular) branch returns the shrunk-rectangular attempt directly without the straight-line last-resort loop — rectangular's `applyTextOverlay` never fails to apply a requested phrase (confirmed in Task 1: `renderTextToSvg` has no minimum-size throw), so that attempt is already guaranteed to have both flags `true` by construction, matching today's behavior exactly (this preserves the existing non-circular fallback path, which was never part of the bug).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlay.test.ts`
Expected: all tests in `textOverlay.test.ts` PASS, including both new row-326-geometry regression tests.

- [ ] **Step 5: Run the full existing suite and type-check**

Run: `cd apps/frontend && npx vitest run && npx tsc --noEmit`
Expected: `tsc` will show errors in `route.ts` (still expects a bare `Buffer` from `applyTextOverlayWithFallback`) — that's expected and fixed in Task 3. Confirm no errors anywhere except `route.ts`.

- [ ] **Step 6: Commit**

```bash
cd apps/frontend
git add src/lib/textOverlay.ts src/lib/textOverlay.test.ts
git commit -m "fix: retry on any missing phrase, not just total failure, in applyTextOverlayWithFallback

The shrink-retry trigger checked whole-buffer equality against the
original input, so a secondary phrase succeeding masked a failed primary
and skipped the retry entirely -- exactly what happened on row 326. Now
requires every requested phrase to have applied before accepting a
result, and falls back to straight-line text only for whichever specific
phrase still can't arc-fit even after the shrink retry, leaving an
already-successful phrase untouched."
```

---

### Task 3: Update `route.ts` to consume `OverlayResult` and persist per-phrase Firestore fields

**Files:**
- Modify: `apps/frontend/src/app/api/n8n/create-asset/route.ts:266-300` (the overlay-application block)

**Interfaces:**
- Consumes: `OverlayResult` from `applyTextOverlayWithFallback`, defined in Task 1/2.
- Produces: four new fields on the `assets` Firestore document — `primaryOverlayApplied: boolean`, `secondaryOverlayApplied: boolean | null`, `primaryUsedFallback: boolean`, `secondaryUsedFallback: boolean | null` — written alongside the existing `overlayApplied`.

- [ ] **Step 1: Update the overlay-application block**

In `apps/frontend/src/app/api/n8n/create-asset/route.ts`, replace:

```ts
      let overlayApplied: boolean | null = null;

      if (phrase || phraseSecondary) {
        const preOverlayPng = png;
        try {
          const overlayStyle = await resolveOverlayStyle(png, { colorPalette, styleTag: style });
          png = await applyTextOverlayWithFallback(
            png,
            phrase,
            overlayStyle.fontBuffer,
            { fill: overlayStyle.fill, stroke: overlayStyle.stroke },
            0.75,
            overlayStyle.shape,
            phraseSecondary || undefined,
          );
          overlayApplied = !png.equals(preOverlayPng);
          if (!overlayApplied) {
            log('create_asset.text_overlay_no_room', { requestId, rowId, phrase, phraseSecondary });
          }
        } catch (overlayErr: any) {
          overlayApplied = false;
          log('create_asset.text_overlay_failed', { requestId, rowId, message: String(overlayErr?.message) });
        }
      }
```

with:

```ts
      let overlayApplied: boolean | null = null;
      let primaryOverlayApplied: boolean | null = null;
      let secondaryOverlayApplied: boolean | null = null;
      let primaryUsedFallback: boolean | null = null;
      let secondaryUsedFallback: boolean | null = null;

      if (phrase || phraseSecondary) {
        try {
          const overlayStyle = await resolveOverlayStyle(png, { colorPalette, styleTag: style });
          const result = await applyTextOverlayWithFallback(
            png,
            phrase,
            overlayStyle.fontBuffer,
            { fill: overlayStyle.fill, stroke: overlayStyle.stroke },
            0.75,
            overlayStyle.shape,
            phraseSecondary || undefined,
          );
          png = result.buffer;
          primaryOverlayApplied = result.primaryApplied;
          secondaryOverlayApplied = phraseSecondary ? result.secondaryApplied : null;
          primaryUsedFallback = result.primaryUsedFallback;
          secondaryUsedFallback = phraseSecondary ? result.secondaryUsedFallback : null;
          overlayApplied = result.primaryApplied || result.secondaryApplied;
          if (!overlayApplied) {
            log('create_asset.text_overlay_no_room', { requestId, rowId, phrase, phraseSecondary });
          } else if (!result.primaryApplied || (phraseSecondary && !result.secondaryApplied)) {
            log('create_asset.text_overlay_partial', {
              requestId, rowId, phrase, phraseSecondary,
              primaryApplied: result.primaryApplied,
              secondaryApplied: result.secondaryApplied,
            });
          }
        } catch (overlayErr: any) {
          overlayApplied = false;
          primaryOverlayApplied = false;
          secondaryOverlayApplied = phraseSecondary ? false : null;
          log('create_asset.text_overlay_failed', { requestId, rowId, message: String(overlayErr?.message) });
        }
      }
```

Then in the `assetDoc` write further down (currently `overlayApplied,` in the object passed to `.add({...})`), add the four new fields:

```ts
      const assetDoc = await adminDb.collection('assets').add({
        title,
        prompt: promptRaw,
        niche,
        style,
        phrase,
        phraseSecondary,
        overlayApplied,
        primaryOverlayApplied,
        secondaryOverlayApplied,
        primaryUsedFallback,
        secondaryUsedFallback,
        imageUrl,
        thumbUrl: imageUrl,
        storagePath,
        source: 'n8n',
        runId,
        rowId: rowId?.toString?.() ?? rowId,
        jobId: jobRef.id,
```

(everything after `jobId: jobRef.id,` is unchanged — this only inserts four new keys into the existing object literal).

- [ ] **Step 2: Type-check and lint**

Run: `cd apps/frontend && npx tsc --noEmit && npx eslint src/app/api/n8n/create-asset/route.ts`
Expected: no errors. This confirms `route.ts` now compiles cleanly against `OverlayResult` with no remaining bare-`Buffer` assumptions.

- [ ] **Step 3: Run the full test suite**

Run: `cd apps/frontend && npx vitest run`
Expected: all tests pass (there is no dedicated `route.test.ts` — this route has no existing unit test suite, confirmed during planning; full-suite green plus a clean type-check is the verification bar for this task, per Global Constraints).

- [ ] **Step 4: Manual verification against the real row 326 asset**

Mirroring this session's color-strategy fix, before considering this plan done: download the real row 326 asset (`https://firebasestorage.googleapis.com/v0/b/ai-merch-dev.firebasestorage.app/o/assets%2F326-JEIvzx0ehUFDCk7dV0Jr-1785678328448-1.png?alt=media&token=343e7fb7-bf0e-44f9-b83a-1f2d3bf389ef`), run it through `applyTextOverlayWithFallback` directly with `phrase: "Nature's Little Necromancer"`, `phraseSecondary: "Reader of the Woods"`, and the same font/shape resolution the route uses, then visually confirm **both** phrases now render. This is not automatable in this plan (requires live Firebase credentials) — flag it as the mandatory manual step before pushing, same as the color-strategy plan's own verification gate.

- [ ] **Step 5: Commit**

```bash
cd apps/frontend
git add src/app/api/n8n/create-asset/route.ts
git commit -m "feat: persist per-phrase overlay outcome to Firestore

overlayApplied was a single boolean derived from whole-buffer equality,
so it read true even when only one of two requested phrases actually
rendered -- exactly the blind spot that let row 326 ship with its
primary phrase silently missing. Adds primaryOverlayApplied/
secondaryOverlayApplied/primaryUsedFallback/secondaryUsedFallback
alongside the existing field."
```

---

## Post-Plan Checklist (not a task — do after Task 3)

- [ ] Manual Verification (Task 3 Step 4) completed and confirmed good against the real row 326 asset.
- [ ] `git push origin main` only after the manual verification passes.
- [ ] Update memory: mark the two-phrase overlay fallback fix as shipped, link from the row-326-discovery memory.
- [ ] Consider whether to also regenerate row 326 itself through n8n now that the fix is live (separate from pushing the code fix).
