# Text-Overlay Color Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `deriveTextColors`' naive RGB-inversion fill-color logic with real palette extraction (median-cut clustering) matched against a curated set of designer-vetted tones by contrast + hue fit.

**Architecture:** All changes are contained to `apps/frontend/src/lib/colorExtraction.ts` and its test file. One new dependency (`quantize` + `@types/quantize`). No signature changes to `deriveTextColors` propagate to any caller.

**Tech Stack:** TypeScript, `sharp` (already used for raw pixel decode), `quantize` (new — median-cut/MMCQ clustering, the same algorithm `colorthief`/`node-vibrant` wrap), Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-color-strategy-design.md` — every requirement below traces to that document.
- `deriveTextColors(artBuffer: Buffer): Promise<ColorPair>` signature must not change.
- Stroke selection stays the existing binary black/white pick — do not touch that logic.
- On any failure, fall back to exactly `{ fill: '#2C2C2A', stroke: '#FFFFFF' }` (unchanged from today).
- Curated palette is exactly these 10 tones (from the spec) — do not add, remove, or edit hex values:
  Charcoal `#2C2C2A`, Cream `#F5F0E6`, Espresso `#4A3427`, Terracotta `#B5603F`, Forest `#3B5D42`, Slate `#3E5C6B`, Burgundy `#6B2E3A`, Mustard `#C9A227`, Navy `#28374D`, Stone `#6B675F`.
- Opaque-pixel alpha threshold: `200` (out of 255).
- Contrast floor: `4.5` (WCAG AA normal-text ratio), applied as a hard constraint before hue-fit.
- Cluster count requested from `quantize`: `5`. Top clusters searched: `3`.
- All work in `apps/frontend/` — run all commands from that directory.
- Verify with `npx tsc --noEmit`, `npx eslint <changed files>`, and `npx vitest run` after every task — all three must be clean before moving to the next task.

---

### Task 1: Add `quantize` dependency and verify its real behavior

**Files:**
- Modify: `apps/frontend/package.json` (add dependencies)
- Create: `apps/frontend/src/lib/quantize.sanity.test.ts` (temporary — deleted at the end of this task, see Step 5)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: confirms `quantize(pixels: [number,number,number][], colorCount: number): { palette(): [number,number,number][]; map(pixel: [number,number,number]): [number,number,number] } | false` behaves as documented, for Task 3/4 to build on.

This task exists because the spec flagged `quantize`'s edge-case behavior (empty input, low color-count images) as unverified — confirm it for real before other code depends on the assumption.

- [ ] **Step 1: Install the dependency**

```bash
cd apps/frontend
npm install quantize
npm install --save-dev @types/quantize
```

- [ ] **Step 2: Write a throwaway sanity test**

```typescript
// apps/frontend/src/lib/quantize.sanity.test.ts
import { describe, it, expect } from 'vitest';
import quantize from 'quantize';

describe('quantize (sanity check of real library behavior before we depend on it)', () => {
  it('returns false for empty pixel input', () => {
    expect(quantize([], 5)).toBe(false);
  });

  it('returns a usable color map for a uniform single-color image', () => {
    const pixels: [number, number, number][] = Array.from({ length: 100 }, () => [159, 141, 116]);
    const cmap = quantize(pixels, 5);
    expect(cmap).not.toBe(false);
    if (cmap === false) throw new Error('unreachable');
    const palette = cmap.palette();
    expect(palette.length).toBeGreaterThanOrEqual(1);
    // The single color present should map back to something close to itself.
    const mapped = cmap.map([159, 141, 116]);
    expect(mapped[0]).toBeGreaterThan(140);
    expect(mapped[1]).toBeGreaterThan(120);
    expect(mapped[2]).toBeGreaterThan(95);
  });

  it('returns multiple clusters for a genuinely two-toned pixel set', () => {
    const pixels: [number, number, number][] = [
      ...Array.from({ length: 100 }, () => [20, 20, 20] as [number, number, number]),
      ...Array.from({ length: 100 }, () => [230, 230, 230] as [number, number, number]),
    ];
    const cmap = quantize(pixels, 5);
    expect(cmap).not.toBe(false);
    if (cmap === false) throw new Error('unreachable');
    expect(cmap.palette().length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Run it**

```bash
npx vitest run src/lib/quantize.sanity.test.ts
```

Expected: all 3 tests PASS. If any fails, the failure output tells you which assumption in the spec's Open Items was wrong — stop and re-read the actual `quantize` output before continuing to Task 2.

- [ ] **Step 4: Confirm TypeScript sees the real types**

```bash
npx tsc --noEmit
```

Expected: clean, no errors (confirms `@types/quantize`'s `export =` pattern resolves correctly with this project's `esModuleInterop: true`).

- [ ] **Step 5: Delete the sanity test and commit the dependency addition**

```bash
rm src/lib/quantize.sanity.test.ts
git add package.json package-lock.json
git commit -m "chore: add quantize dependency for palette extraction"
```

---

### Task 2: Curated palette and color-math helpers

**Files:**
- Modify: `apps/frontend/src/lib/colorExtraction.ts:1-19` (imports and type section)
- Test: `apps/frontend/src/lib/colorExtraction.test.ts` (new describe block, appended)

**Interfaces:**
- Consumes: nothing new (pure functions, no I/O).
- Produces (all newly exported from `colorExtraction.ts`, for Task 3/4/5 to consume):
  - `interface CuratedColor { name: string; hex: string; rgb: Rgb }`
  - `const CURATED_PALETTE: CuratedColor[]`
  - `function rgbToHueSaturation(rgb: Rgb): { hue: number; saturation: number }`
  - `function circularHueDistance(a: number, b: number): number`
  - Existing `Rgb`, `relativeLuminance`, `toHex` stay as-is (unchanged, already present at `colorExtraction.ts:15-50`).
  - `contrastRatio` (already present, currently private) becomes exported in this task — Task 4's boundary test needs to call it directly to compute an independent expected value.

- [ ] **Step 1: Write the failing tests**

The test file currently starts with `import { deriveTextColors } from './colorExtraction';` (line 3) — extend that single import statement (don't add a second, separate `import ... from './colorExtraction'` line; every later task in this plan also adds names to this same statement, to avoid duplicate-import lines in one file):

```typescript
import { deriveTextColors, CURATED_PALETTE, rgbToHueSaturation, circularHueDistance } from './colorExtraction';
```

Then append below the existing tests:

```typescript
describe('CURATED_PALETTE', () => {
  it('contains exactly the 10 spec-defined tones', () => {
    const names = CURATED_PALETTE.map((c) => c.name).sort();
    expect(names).toEqual(
      ['Burgundy', 'Charcoal', 'Cream', 'Espresso', 'Forest', 'Mustard', 'Navy', 'Slate', 'Stone', 'Terracotta'].sort(),
    );
  });

  it('every entry has an rgb value consistent with its hex', () => {
    for (const color of CURATED_PALETTE) {
      const hex = color.hex.slice(1);
      expect(color.rgb.r).toBe(parseInt(hex.slice(0, 2), 16));
      expect(color.rgb.g).toBe(parseInt(hex.slice(2, 4), 16));
      expect(color.rgb.b).toBe(parseInt(hex.slice(4, 6), 16));
    }
  });
});

describe('rgbToHueSaturation', () => {
  it('returns zero saturation for pure gray/black/white', () => {
    expect(rgbToHueSaturation({ r: 0, g: 0, b: 0 }).saturation).toBe(0);
    expect(rgbToHueSaturation({ r: 255, g: 255, b: 255 }).saturation).toBe(0);
    expect(rgbToHueSaturation({ r: 128, g: 128, b: 128 }).saturation).toBe(0);
  });

  it('identifies pure red as hue 0', () => {
    const { hue, saturation } = rgbToHueSaturation({ r: 255, g: 0, b: 0 });
    expect(hue).toBe(0);
    expect(saturation).toBeGreaterThan(0);
  });

  it('identifies pure blue as hue 240', () => {
    const { hue } = rgbToHueSaturation({ r: 0, g: 0, b: 255 });
    expect(hue).toBeCloseTo(240, 0);
  });
});

describe('circularHueDistance', () => {
  it('returns 0 for identical hues', () => {
    expect(circularHueDistance(30, 30)).toBe(0);
  });

  it('wraps around correctly across the 0/360 boundary', () => {
    expect(circularHueDistance(10, 350)).toBe(20);
  });

  it('returns the max possible distance (180) for opposite hues', () => {
    expect(circularHueDistance(0, 180)).toBe(180);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/colorExtraction.test.ts
```

Expected: FAIL — `CURATED_PALETTE`, `rgbToHueSaturation`, `circularHueDistance` are not exported yet.

- [ ] **Step 3: Implement**

First, in `apps/frontend/src/lib/colorExtraction.ts`, change the existing (currently private) `contrastRatio` function at line 44 from `function contrastRatio` to `export function contrastRatio` — no other change to that function's body.

Then add after the existing `interface Rgb { ... }` block (after line 19):

```typescript
export interface CuratedColor {
  name: string;
  hex: string;
  rgb: Rgb;
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const CURATED_PALETTE: CuratedColor[] = [
  { name: 'Charcoal', hex: '#2C2C2A', rgb: hexToRgb('#2C2C2A') },
  { name: 'Cream', hex: '#F5F0E6', rgb: hexToRgb('#F5F0E6') },
  { name: 'Espresso', hex: '#4A3427', rgb: hexToRgb('#4A3427') },
  { name: 'Terracotta', hex: '#B5603F', rgb: hexToRgb('#B5603F') },
  { name: 'Forest', hex: '#3B5D42', rgb: hexToRgb('#3B5D42') },
  { name: 'Slate', hex: '#3E5C6B', rgb: hexToRgb('#3E5C6B') },
  { name: 'Burgundy', hex: '#6B2E3A', rgb: hexToRgb('#6B2E3A') },
  { name: 'Mustard', hex: '#C9A227', rgb: hexToRgb('#C9A227') },
  { name: 'Navy', hex: '#28374D', rgb: hexToRgb('#28374D') },
  { name: 'Stone', hex: '#6B675F', rgb: hexToRgb('#6B675F') },
];

// Hue in degrees [0,360); saturation in [0,1]. Hue is 0 (meaningless) when
// saturation is 0 -- pure gray/black/white has no hue to speak of.
export function rgbToHueSaturation({ r, g, b }: Rgb): { hue: number; saturation: number } {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (delta === 0) return { hue: 0, saturation: 0 };

  let hue: number;
  if (max === rN) hue = ((gN - bN) / delta) % 6;
  else if (max === gN) hue = (bN - rN) / delta + 2;
  else hue = (rN - gN) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;

  return { hue, saturation };
}

export function circularHueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/colorExtraction.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/lib/colorExtraction.ts src/lib/colorExtraction.test.ts
git add src/lib/colorExtraction.ts src/lib/colorExtraction.test.ts
git commit -m "feat: add curated color palette and hue/saturation math helpers"
```

---

### Task 3: Opaque-pixel extraction and cluster population counting

**Files:**
- Modify: `apps/frontend/src/lib/colorExtraction.ts` (add after Task 2's additions)
- Test: `apps/frontend/src/lib/colorExtraction.test.ts` (new describe block, appended)

**Interfaces:**
- Consumes: `getArtBoundingBox` from `./textOverlay` (already imported at `colorExtraction.ts:2`, unchanged).
- Produces (for Task 4 to consume):
  - `type RgbPixel = quantize.RgbPixel` (i.e. `[number, number, number]`)
  - `function extractOpaquePixels(artBuffer: Buffer): Promise<RgbPixel[]>`
  - `function topClusters(pixels: RgbPixel[]): RgbPixel[]` — throws if `quantize` returns `false` (empty input)

- [ ] **Step 1: Write the failing tests**

Extend the same import statement from Task 2 (now on line 3) to also include `extractOpaquePixels, topClusters`:

```typescript
import { deriveTextColors, CURATED_PALETTE, rgbToHueSaturation, circularHueDistance, extractOpaquePixels, topClusters } from './colorExtraction';
```

Then append below the existing tests:

```typescript
async function solidCanvasWithAlpha(r: number, g: number, b: number, alpha: number): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 200, channels: 4, background: { r, g, b, alpha } },
  }).png().toBuffer();
}

describe('extractOpaquePixels', () => {
  it('returns only opaque pixels, ignoring a fully transparent canvas', async () => {
    const canvas = await solidCanvasWithAlpha(159, 141, 116, 0);
    const pixels = await extractOpaquePixels(canvas);
    expect(pixels.length).toBe(0);
  });

  it('returns pixels matching a fully opaque solid canvas', async () => {
    const canvas = await solidCanvasWithAlpha(159, 141, 116, 1);
    const pixels = await extractOpaquePixels(canvas);
    expect(pixels.length).toBeGreaterThan(0);
    expect(pixels[0]).toEqual([159, 141, 116]);
  });
});

describe('topClusters', () => {
  it('throws when given an empty pixel array', () => {
    expect(() => topClusters([])).toThrow();
  });

  it('returns the single color for a uniform pixel set', () => {
    const pixels: [number, number, number][] = Array.from({ length: 500 }, () => [159, 141, 116]);
    const clusters = topClusters(pixels);
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0][0]).toBeGreaterThan(140);
  });

  it('returns the most populous cluster first for a two-toned pixel set', () => {
    const pixels: [number, number, number][] = [
      ...Array.from({ length: 700 }, () => [20, 20, 20] as [number, number, number]),
      ...Array.from({ length: 100 }, () => [230, 230, 230] as [number, number, number]),
    ];
    const clusters = topClusters(pixels);
    // The dark cluster has 7x the population -- it must be first.
    expect(clusters[0][0]).toBeLessThan(60);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/colorExtraction.test.ts
```

Expected: FAIL — `extractOpaquePixels`, `topClusters` are not defined yet.

- [ ] **Step 3: Implement**

Add to `apps/frontend/src/lib/colorExtraction.ts`, after the Task 2 additions:

```typescript
import quantize from 'quantize';

type RgbPixel = quantize.RgbPixel;

const OPAQUE_ALPHA_THRESHOLD = 200;
const CLUSTER_COUNT = 5;
const TOP_CLUSTERS_TO_SEARCH = 3;

export async function extractOpaquePixels(artBuffer: Buffer): Promise<RgbPixel[]> {
  const box = await getArtBoundingBox(artBuffer);
  const { data, info } = await sharp(artBuffer)
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: RgbPixel[] = [];
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] > OPAQUE_ALPHA_THRESHOLD) {
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return pixels;
}

export function topClusters(pixels: RgbPixel[]): RgbPixel[] {
  const cmap = quantize(pixels, CLUSTER_COUNT);
  if (!cmap) {
    throw new Error('quantize returned no color map (no opaque pixels found)');
  }

  const counts = new Map<string, number>();
  for (const pixel of pixels) {
    const mapped = cmap.map(pixel);
    const key = mapped.join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return cmap
    .palette()
    .slice()
    .sort((a, b) => (counts.get(b.join(',')) ?? 0) - (counts.get(a.join(',')) ?? 0))
    .slice(0, TOP_CLUSTERS_TO_SEARCH);
}
```

Also add `import quantize from 'quantize';` to the top import block (near `import sharp from 'sharp';` at line 1).

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/colorExtraction.test.ts
```

Expected: all PASS. If the two-toned test's exact ordering doesn't match, double-check the `counts` map key (`join(',')`) matches between the `palette()` entries and the `map()` results — both must come from the same `cmap` instance.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/lib/colorExtraction.ts src/lib/colorExtraction.test.ts
git add src/lib/colorExtraction.ts src/lib/colorExtraction.test.ts
git commit -m "feat: add opaque-pixel extraction and cluster population counting"
```

---

### Task 4: Candidate scoring and fill selection (the actual bug fix)

**Files:**
- Modify: `apps/frontend/src/lib/colorExtraction.ts` (add after Task 3's additions)
- Test: `apps/frontend/src/lib/colorExtraction.test.ts` (new describe block, appended)

**Interfaces:**
- Consumes: `CuratedColor`, `CURATED_PALETTE`, `rgbToHueSaturation`, `circularHueDistance` (Task 2); `RgbPixel`, `topClusters` (Task 3); existing `Rgb`, `contrastRatio` (pre-existing).
- Produces (for Task 5 to consume): `function pickFillColor(artBuffer: Buffer): Promise<CuratedColor>` — throws on any extraction failure (caller wraps in try/catch).

- [ ] **Step 1: Write the failing tests**

Extend the same import statement from Tasks 2-3 to also include `pickFillColor, contrastRatio`:

```typescript
import { deriveTextColors, CURATED_PALETTE, rgbToHueSaturation, circularHueDistance, extractOpaquePixels, topClusters, pickFillColor, contrastRatio } from './colorExtraction';
```

Then append below the existing tests:

```typescript
describe('pickFillColor (regression: warm art must not resolve to a cool fill)', () => {
  it('picks a warm-hued candidate for a warm tan dominant color, never a blue one', async () => {
    // Measured true dominant color of the real "Toadally enchanted" toad
    // asset (row 322/323/324) that originally exposed this bug: #9F8D74.
    const canvas = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 159, g: 141, b: 116, alpha: 1 } },
    }).png().toBuffer();

    const fill = await pickFillColor(canvas);
    const { hue, saturation } = rgbToHueSaturation(fill.rgb);

    // The bug produced #60728B (hue ~200, squarely in the blue range).
    // A correct pick for warm tan input must not land in that range.
    if (saturation > 0.05) {
      const inBlueRange = hue > 180 && hue < 260;
      expect(inBlueRange).toBe(false);
    }
  });

  it('picks Cream for a pure black canvas (highest-contrast candidate)', async () => {
    const canvas = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();

    const fill = await pickFillColor(canvas);
    expect(fill.name).toBe('Cream');
  });

  it('picks Charcoal for a pure white canvas (highest-contrast candidate)', async () => {
    const canvas = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png().toBuffer();

    const fill = await pickFillColor(canvas);
    expect(fill.name).toBe('Charcoal');
  });

  it('degrades to highest-contrast-only selection for a near-gray (not exactly zero saturation) source', async () => {
    // rgb(130,128,126) has saturation ~0.016 -- comfortably below the 0.08
    // grayscale threshold, but NOT exactly 0 like pure black/white. This is
    // the actual boundary case the spec's "near-grayscale" test calls for.
    const sourceRgb = { r: 130, g: 128, b: 126 };
    const canvas = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { ...sourceRgb, alpha: 1 } },
    }).png().toBuffer();

    const { saturation } = rgbToHueSaturation(sourceRgb);
    expect(saturation).toBeLessThan(0.08);

    const fill = await pickFillColor(canvas);

    // Independently compute which curated candidate truly has the highest
    // contrast against this exact source -- the grayscale-degradation branch
    // must match this, not whatever hue-fit would have picked instead.
    const trueBestByContrast = CURATED_PALETTE.slice()
      .sort((a, b) => contrastRatio(sourceRgb, b.rgb) - contrastRatio(sourceRgb, a.rgb))[0];

    expect(fill.name).toBe(trueBestByContrast.name);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/colorExtraction.test.ts
```

Expected: FAIL — `pickFillColor` is not defined yet.

- [ ] **Step 3: Implement**

Add to `apps/frontend/src/lib/colorExtraction.ts`, after the Task 3 additions:

```typescript
const CONTRAST_FLOOR = 4.5;
const GRAYSCALE_SATURATION_THRESHOLD = 0.08;

interface Candidate {
  color: CuratedColor;
  hueDistance: number;
  contrast: number;
}

function bestCandidateForCluster(cluster: RgbPixel): Candidate {
  const clusterRgb: Rgb = { r: cluster[0], g: cluster[1], b: cluster[2] };
  const { hue: clusterHue, saturation: clusterSaturation } = rgbToHueSaturation(clusterRgb);

  const scored: Candidate[] = CURATED_PALETTE.map((color) => ({
    color,
    hueDistance: circularHueDistance(clusterHue, rgbToHueSaturation(color.rgb).hue),
    contrast: contrastRatio(clusterRgb, color.rgb),
  }));

  const passing = scored.filter((c) => c.contrast >= CONTRAST_FLOOR);
  const pool = passing.length > 0 ? passing : scored;

  if (clusterSaturation < GRAYSCALE_SATURATION_THRESHOLD) {
    return pool.slice().sort((a, b) => b.contrast - a.contrast)[0];
  }

  return pool.slice().sort((a, b) => a.hueDistance - b.hueDistance)[0];
}

export async function pickFillColor(artBuffer: Buffer): Promise<CuratedColor> {
  const pixels = await extractOpaquePixels(artBuffer);
  const clusters = topClusters(pixels);

  const candidates = clusters.map((cluster) => bestCandidateForCluster(cluster));

  const best = candidates.slice().sort((a, b) => {
    const aPasses = a.contrast >= CONTRAST_FLOOR ? 0 : 1;
    const bPasses = b.contrast >= CONTRAST_FLOOR ? 0 : 1;
    if (aPasses !== bPasses) return aPasses - bPasses;
    return a.hueDistance - b.hueDistance;
  })[0];

  return best.color;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/colorExtraction.test.ts
```

Expected: all PASS. If the black/white canvas tests pick a different candidate name than predicted (`Cream`/`Charcoal`), read the actual failure output — if the actual pick still has a legitimately high contrast ratio and is directionally correct (a light tone for black, a dark tone for white), update the assertion to match reality rather than forcing the prediction; if it picks something with a low contrast ratio or throws, that's a real bug in the scoring logic above.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/lib/colorExtraction.ts src/lib/colorExtraction.test.ts
git add src/lib/colorExtraction.ts src/lib/colorExtraction.test.ts
git commit -m "feat: add contrast+hue-fit candidate scoring against curated palette"
```

---

### Task 5: Wire into `deriveTextColors`, remove old logic, update existing tests

**Files:**
- Modify: `apps/frontend/src/lib/colorExtraction.ts:21-29` (delete `extractDominantColor`), `:52-64` (rewrite `deriveTextColors`)
- Modify: `apps/frontend/src/lib/colorExtraction.test.ts` (update the 2 pre-existing solid-canvas tests' expected values)

**Interfaces:**
- Consumes: `pickFillColor` (Task 4).
- Produces: `deriveTextColors(artBuffer: Buffer): Promise<ColorPair>` — same public signature as before this whole plan started; this is the last task, nothing downstream in this plan consumes it.

- [ ] **Step 1: Update the two pre-existing tests' expected values first**

In `apps/frontend/src/lib/colorExtraction.test.ts`, change the original `describe('deriveTextColors', ...)` block's first two tests:

```typescript
describe('deriveTextColors', () => {
  it('picks a light, high-contrast fill for a dark image', async () => {
    const canvas = await solidCanvas(0, 0, 0);
    const result = await deriveTextColors(canvas);
    expect(result).toEqual({ fill: '#F5F0E6', stroke: '#000000' });
  });

  it('picks a dark, high-contrast fill for a light image', async () => {
    const canvas = await solidCanvas(255, 255, 255);
    const result = await deriveTextColors(canvas);
    expect(result).toEqual({ fill: '#2C2C2A', stroke: '#FFFFFF' });
  });

  it('falls back to the default pair when extraction fails', async () => {
    const invalidBuffer = Buffer.from('not a real image');
    const result = await deriveTextColors(invalidBuffer);
    expect(result).toEqual({ fill: '#2C2C2A', stroke: '#FFFFFF' });
  });
});
```

(Only the test names and the first two `.toEqual(...)` values changed; the third test is untouched.)

- [ ] **Step 2: Run to verify these two fail (old inversion logic still in place)**

```bash
npx vitest run src/lib/colorExtraction.test.ts
```

Expected: the two updated tests FAIL against the still-unmodified `deriveTextColors` (which still returns `#FFFFFF`/`#000000` via inversion). The third (fallback) test still PASSES, unaffected.

- [ ] **Step 3: Delete `extractDominantColor`, rewrite `deriveTextColors`**

In `apps/frontend/src/lib/colorExtraction.ts`, delete the entire `extractDominantColor` function (original lines 21-29):

```typescript
async function extractDominantColor(artBuffer: Buffer): Promise<Rgb> {
  const box = await getArtBoundingBox(artBuffer);
  const region = await sharp(artBuffer)
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(1, 1, { fit: 'fill' })
    .raw()
    .toBuffer();
  return { r: region[0], g: region[1], b: region[2] };
}
```

Then replace the existing `deriveTextColors` function (original lines 52-64):

```typescript
// Fill is the near-inverse of the art's dominant color (reads as distinct
// from the background); stroke is whichever of black/white contrasts more
// against that fill, guaranteeing legibility without hardcoding either.
export async function deriveTextColors(artBuffer: Buffer): Promise<ColorPair> {
  try {
    const dominant = await extractDominantColor(artBuffer);
    const fillRgb: Rgb = { r: 255 - dominant.r, g: 255 - dominant.g, b: 255 - dominant.b };
    const strokeRgb = contrastRatio(fillRgb, BLACK) >= contrastRatio(fillRgb, WHITE) ? BLACK : WHITE;
    return { fill: toHex(fillRgb), stroke: toHex(strokeRgb) };
  } catch {
    return { fill: DEFAULT_FILL, stroke: DEFAULT_STROKE };
  }
}
```

with:

```typescript
// Fill is picked from a small curated palette by contrast + hue fit against
// the art's own extracted dominant clusters (see pickFillColor) -- never a
// mathematically-derived/inverted color. Stroke is whichever of black/white
// contrasts more against that fill, guaranteeing legibility without
// hardcoding either.
export async function deriveTextColors(artBuffer: Buffer): Promise<ColorPair> {
  try {
    const fillColor = await pickFillColor(artBuffer);
    const fillRgb = fillColor.rgb;
    const strokeRgb = contrastRatio(fillRgb, BLACK) >= contrastRatio(fillRgb, WHITE) ? BLACK : WHITE;
    return { fill: fillColor.hex, stroke: toHex(strokeRgb) };
  } catch {
    return { fill: DEFAULT_FILL, stroke: DEFAULT_STROKE };
  }
}
```

- [ ] **Step 4: Run the full test file to verify everything passes**

```bash
npx vitest run src/lib/colorExtraction.test.ts
```

Expected: all tests PASS, including the two updated ones and everything added in Tasks 2-4.

- [ ] **Step 5: Full verification sweep**

```bash
npx tsc --noEmit
npx eslint src/lib/colorExtraction.ts src/lib/colorExtraction.test.ts
npx vitest run
```

Expected: `tsc` clean, `eslint` clean, full suite passing (this project's suite was at 90/90 before this plan; confirm the new count reflects only additions, no unrelated regressions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/colorExtraction.ts src/lib/colorExtraction.test.ts
git commit -m "fix: replace RGB-inversion fill color with curated palette matching

Fixes the grayish-blue fill on warm/earthy art (rows 322/323/324):
inverting a warm dominant color always produces its cool complement,
regardless of extraction accuracy. Fill is now picked from a fixed
10-tone curated palette by contrast floor (4.5:1) + hue fit against
the art's real dominant clusters (quantize median-cut extraction),
not a computed inverse.

Also fixes a related premultiplied-alpha sampling bug in the old
single-pixel-average extraction, folded into this rewrite.

See docs/superpowers/specs/2026-08-01-color-strategy-design.md"
```

---

## Manual Verification (not automated — do this after Task 5, before pushing)

The spec's regression was discovered via a real production asset, not just synthetic tests. Before pushing:

1. Re-download the real row-322/323 art (or regenerate a similar asset) and run it through `deriveTextColors` directly (a throwaway `tsx` script, same pattern used earlier this session — delete after use).
2. Visually confirm the picked fill color looks intentional against the actual artwork, not just numerically passing.
3. Push only after this manual check, since the whole point of this redesign was a failure that unit tests alone didn't originally catch (the bug was in production behavior, not test coverage).

```bash
git push origin main
```
