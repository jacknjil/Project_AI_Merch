# Text-Overlay Compositing (App-Side Prototype) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, tested app-side pipeline that composites a text phrase onto Recraft-generated art (which cannot reliably render its own legible text), and prove it visually on one niche ("Espresso Yourself" coffee-mug mascot) before wiring it into the live n8n-facing generation route.

**Architecture:** Two new pure-function TypeScript modules in `src/lib/` — `textRender.ts` (opentype.js: text → SVG path, auto-fit sized to a target box) and `textOverlay.ts` (sharp: alpha-channel bounding-box detection, safe-zone computation, compositing). A bundled OFL-licensed font ships in `src/lib/fonts/`. A standalone `ops/` script exercises the full chain against a live Recraft call and writes a PNG to disk for manual visual inspection. Wiring this into `src/app/api/n8n/create-asset/route.ts` (the production batch-generation endpoint) is explicitly **out of scope** for this plan — see "Out of Scope" at the end.

**Tech Stack:** TypeScript, sharp ^0.35.2 (already a dependency), opentype.js 2.0.0 (new), vitest ^4.1.9 (existing test runner), tsx (new, dev-only — lets the `ops/` prototype script import real `.ts` modules directly without a build step).

## Global Constraints

- Node 20 required (`.nvmrc`) — use `nvm use` before running anything.
- Follow this repo's established test convention exactly (see `src/lib/printify.test.ts`): vitest, `describe`/`it`/`expect`, no mocking framework, synthetic `sharp({create:{...}})` buffers built inline, assertions via `sharp(output).metadata()` / raw pixel reads. Do not introduce a new testing pattern.
- Files stay small and single-responsibility: image-geometry logic (sharp) and text-rendering logic (opentype.js) are separate files, matching the "many small files" convention already used in `src/lib/`.
- No route/API changes in this plan — `src/app/api/n8n/create-asset/route.ts` is read-only context here, not modified.
- Font must be OFL (or equivalent commercial-embedding-safe) licensed — verified below.

---

### Task 1: `textRender.ts` — opentype.js text-to-SVG-path rendering with auto-fit sizing

**Files:**
- Create: `src/lib/textRender.ts`
- Create: `src/lib/textRender.test.ts`
- Create: `src/lib/fonts/LuckiestGuy-Regular.ttf` (binary font asset)
- Modify: `package.json` (add `opentype.js` dependency, `@types/opentype.js` dev dependency)

**Interfaces:**
- Produces: `loadFont(fontBuffer: Buffer): opentype.Font`, `renderTextToSvg(font: opentype.Font, text: string, options: RenderTextOptions): RenderedText` where `RenderTextOptions = { maxWidth: number; maxHeight: number; fill?: string; stroke?: string; strokeWidth?: number }` and `RenderedText = { svg: Buffer; width: number; height: number }`. Task 2 imports both of these by name.

- [ ] **Step 1: Download the bundled font and install dependencies**

```bash
mkdir -p src/lib/fonts
curl -sL "https://fonts.gstatic.com/s/luckiestguy/v25/_gP_1RrxsjcxVyin9l9n_j2RSg.ttf" -o src/lib/fonts/LuckiestGuy-Regular.ttf
ls -la src/lib/fonts/LuckiestGuy-Regular.ttf
```
Expected: file exists, ~57KB. This is Google's "Luckiest Guy" font (OFL licensed, by Astigmatic) — a bold display face already used across POD/sticker-style typography, a good match for the cartoon-mascot niche. Safe for commercial embedding under the OFL.

```bash
npm install opentype.js
npm install -D @types/opentype.js
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/textRender.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadFont, renderTextToSvg } from './textRender';

const fontBuffer = readFileSync(join(__dirname, 'fonts', 'LuckiestGuy-Regular.ttf'));

describe('loadFont', () => {
  it('parses the bundled font file into an opentype Font', () => {
    const font = loadFont(fontBuffer);
    expect(font.unitsPerEm).toBeGreaterThan(0);
  });
});

describe('renderTextToSvg', () => {
  const font = loadFont(fontBuffer);

  it('fits rendered text within the given max width and height', () => {
    const result = renderTextToSvg(font, 'ESPRESSO YOURSELF', { maxWidth: 800, maxHeight: 200 });
    expect(result.width).toBeLessThanOrEqual(800);
    expect(result.height).toBeLessThanOrEqual(200);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('produces an SVG buffer containing a path element', () => {
    const result = renderTextToSvg(font, 'HELLO', { maxWidth: 500, maxHeight: 200 });
    expect(result.svg.toString('utf-8')).toContain('<path');
  });

  it('scales a longer phrase down to still fit the same box as a shorter phrase', () => {
    const short = renderTextToSvg(font, 'HI', { maxWidth: 400, maxHeight: 150 });
    const long = renderTextToSvg(font, 'ESPRESSO YOURSELF TODAY', { maxWidth: 400, maxHeight: 150 });
    expect(short.width).toBeLessThanOrEqual(400);
    expect(long.width).toBeLessThanOrEqual(400);
  });

  it('throws for an empty phrase', () => {
    expect(() => renderTextToSvg(font, '', { maxWidth: 400, maxHeight: 150 })).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- textRender`
Expected: FAIL — `Cannot find module './textRender'`

- [ ] **Step 4: Write the implementation**

Create `src/lib/textRender.ts`:

```ts
import opentype from 'opentype.js';

export interface RenderedText {
  svg: Buffer;
  width: number;
  height: number;
}

export interface RenderTextOptions {
  maxWidth: number;
  maxHeight: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export function loadFont(fontBuffer: Buffer): opentype.Font {
  return opentype.parse(fontBuffer);
}

function measureAtSize(font: opentype.Font, text: string, fontSize: number) {
  const path = font.getPath(text, 0, fontSize, fontSize);
  const bbox = path.getBoundingBox();
  return { path, bbox, width: bbox.x2 - bbox.x1, height: bbox.y2 - bbox.y1 };
}

export function renderTextToSvg(font: opentype.Font, text: string, options: RenderTextOptions): RenderedText {
  const { maxWidth, maxHeight, fill = '#2C2C2A', stroke = '#FFFFFF', strokeWidth = 4 } = options;
  const REFERENCE_SIZE = 200;

  const ref = measureAtSize(font, text, REFERENCE_SIZE);
  if (ref.width <= 0 || ref.height <= 0) {
    throw new Error(`Cannot render empty or zero-width text: "${text}"`);
  }

  const scale = Math.min(maxWidth / ref.width, maxHeight / ref.height);
  const fontSize = REFERENCE_SIZE * scale;
  const final = measureAtSize(font, text, fontSize);
  // The bare-number form isn't just decimalPlaces shorthand: opentype.js's
  // toPathData coerces a plain number into { decimalPlaces, flipY: false }.
  // getPath() already emits SVG/canvas-down coordinates, so the object form's
  // flipY:true default would double-flip the glyphs upside down — this numeric
  // call is required for correct orientation, not an arbitrary style choice.
  // (@types/opentype.js 1.3.10 only declares the number overload anyway.)
  const pathData = final.path.toPathData(2);

  const width = Math.max(1, Math.round(final.width));
  const height = Math.max(1, Math.round(final.height));

  const svg = `<svg width="${width}" height="${height}" viewBox="${final.bbox.x1} ${final.bbox.y1} ${final.width} ${final.height}" xmlns="http://www.w3.org/2000/svg"><path d="${pathData}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke"/></svg>`;

  return { svg: Buffer.from(svg), width, height };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- textRender`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/textRender.ts src/lib/textRender.test.ts src/lib/fonts/LuckiestGuy-Regular.ttf
git commit -m "feat: add opentype.js text-to-SVG rendering with auto-fit sizing"
```

---

### Task 2: `textOverlay.ts` — alpha bounding-box detection, safe-zone computation, compositing

**Files:**
- Create: `src/lib/textOverlay.ts`
- Create: `src/lib/textOverlay.test.ts`

**Interfaces:**
- Consumes: `loadFont`, `renderTextToSvg` from `./textRender` (Task 1).
- Produces: `getArtBoundingBox(buffer: Buffer): Promise<BoundingBox>`, `computeTextZone(canvasWidth: number, canvasHeight: number, artBox: BoundingBox, marginPx: number): TextZone`, `compositeTextOverArt(artBuffer: Buffer, textPngBuffer: Buffer, zone: TextZone): Promise<Buffer>`, `applyTextOverlay(artBuffer: Buffer, phrase: string, fontBuffer: Buffer): Promise<Buffer>` where `BoundingBox = { left: number; top: number; width: number; height: number }` and `TextZone = { x: number; y: number; width: number; height: number }`. The `ops/text-overlay-prototype.mjs` script in Task 3 imports `applyTextOverlay` by name.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/textOverlay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getArtBoundingBox, computeTextZone, compositeTextOverArt, applyTextOverlay } from './textOverlay';

const fontBuffer = readFileSync(join(__dirname, 'fonts', 'LuckiestGuy-Regular.ttf'));

describe('getArtBoundingBox', () => {
  it('detects the bounding box of opaque content on a transparent canvas', async () => {
    const opaque = await sharp({
      create: { width: 40, height: 30, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();

    const canvas = await sharp({
      create: { width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: opaque, left: 60, top: 20 }])
      .png()
      .toBuffer();

    const box = await getArtBoundingBox(canvas);
    expect(box).toEqual({ left: 60, top: 20, width: 40, height: 30 });
  });

  it('treats a uniform full-bleed image as filling the entire canvas', async () => {
    const uniform = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const box = await getArtBoundingBox(uniform);
    expect(box).toEqual({ left: 0, top: 0, width: 300, height: 300 });
  });
});

describe('computeTextZone', () => {
  it('reserves the area above the art bounding box, inset by the margin', () => {
    const zone = computeTextZone(1000, 1000, { left: 100, top: 200, width: 800, height: 700 }, 40);
    expect(zone).toEqual({ x: 40, y: 40, width: 920, height: 120 });
  });

  it('returns zero height when the art leaves no room above it', () => {
    const zone = computeTextZone(1000, 1000, { left: 0, top: 10, width: 1000, height: 990 }, 40);
    expect(zone.height).toBe(0);
  });
});

describe('compositeTextOverArt', () => {
  it('places the text buffer centered within the zone, preserving alpha', async () => {
    const art = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();

    const text = await sharp({
      create: { width: 50, height: 20, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png().toBuffer();

    const zone = { x: 0, y: 0, width: 200, height: 80 };
    const output = await compositeTextOverArt(art, text, zone);
    const meta = await sharp(output).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);

    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    const centerX = Math.round(zone.width / 2);
    const centerY = Math.round(zone.height / 2);
    const idx = (centerY * info.width + centerX) * info.channels;
    expect(data[idx + 3]).toBeGreaterThan(0);
  });
});

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
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(800);
    expect(meta.hasAlpha).toBe(true);
    expect(output.equals(canvas)).toBe(false);
  });

  it('returns the original buffer unchanged when there is no room for text', async () => {
    const canvas = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const output = await applyTextOverlay(canvas, 'ESPRESSO YOURSELF', fontBuffer);
    expect(output.equals(canvas)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- textOverlay`
Expected: FAIL — `Cannot find module './textOverlay'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/textOverlay.ts`:

```ts
import sharp from 'sharp';
import { loadFont, renderTextToSvg } from './textRender';

export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export async function getArtBoundingBox(buffer: Buffer): Promise<BoundingBox> {
  const { info } = await sharp(buffer).trim().toBuffer({ resolveWithObject: true });
  return {
    left: Math.abs(info.trimOffsetLeft ?? 0),
    top: Math.abs(info.trimOffsetTop ?? 0),
    width: info.width,
    height: info.height,
  };
}

export interface TextZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeTextZone(
  canvasWidth: number,
  canvasHeight: number,
  artBox: BoundingBox,
  marginPx: number,
): TextZone {
  const availableHeight = Math.max(artBox.top - marginPx * 2, 0);
  return {
    x: marginPx,
    y: marginPx,
    width: Math.max(canvasWidth - marginPx * 2, 0),
    height: availableHeight,
  };
}

export async function compositeTextOverArt(
  artBuffer: Buffer,
  textPngBuffer: Buffer,
  zone: TextZone,
): Promise<Buffer> {
  const textMeta = await sharp(textPngBuffer).metadata();
  const textWidth = textMeta.width ?? 0;
  const textHeight = textMeta.height ?? 0;

  const left = Math.max(0, Math.round(zone.x + (zone.width - textWidth) / 2));
  const top = Math.max(0, Math.round(zone.y + (zone.height - textHeight) / 2));

  return sharp(artBuffer)
    .composite([{ input: textPngBuffer, left, top }])
    .png()
    .toBuffer();
}

export async function applyTextOverlay(
  artBuffer: Buffer,
  phrase: string,
  fontBuffer: Buffer,
): Promise<Buffer> {
  const meta = await sharp(artBuffer).metadata();
  const canvasWidth = meta.width ?? 0;
  const canvasHeight = meta.height ?? 0;

  const artBox = await getArtBoundingBox(artBuffer);
  const marginPx = Math.round(Math.min(canvasWidth, canvasHeight) * 0.04);
  const zone = computeTextZone(canvasWidth, canvasHeight, artBox, marginPx);

  if (zone.height <= 0 || zone.width <= 0) return artBuffer;

  const font = loadFont(fontBuffer);
  const rendered = renderTextToSvg(font, phrase, { maxWidth: zone.width, maxHeight: zone.height });
  const textPng = await sharp(rendered.svg).png().toBuffer();

  return compositeTextOverArt(artBuffer, textPng, zone);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- textOverlay`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/textOverlay.ts src/lib/textOverlay.test.ts
git commit -m "feat: add alpha-bbox safe-zone detection and text compositing"
```

---

### Task 3: `ops/text-overlay-prototype.mjs` — manual end-to-end visual verification

**Files:**
- Create: `ops/text-overlay-prototype.mjs`
- Modify: `package.json` (add `tsx` dev dependency)
- Modify: `.gitignore` (ignore the generated output PNG)

**Interfaces:**
- Consumes: `recraftGenerate`, `removeBackground` from `../src/lib/recraft.ts` (existing); `hasAlphaChannel` from `../src/lib/printify.ts` (existing); `applyTextOverlay` from `../src/lib/textOverlay.ts` (Task 2).

This task has no automated test — it's a one-off manual script whose "test" is the human visually inspecting the output PNG, matching the doc's own "iterate fully in a local session... verify visually" requirement and the user's explicit choice to prototype on one niche first before generalizing. `ops/` scripts in this repo are Node ESM run directly (see `ops/n8n-find-asset.mjs`, `ops/firebase-admin/reset-assets.mjs`) and none of them currently import the TypeScript `src/lib/*.ts` modules — they either reimplement small bits of logic or call deployed HTTP APIs. Reimplementing `applyTextOverlay`/`recraftGenerate` here would duplicate already-tested logic (violates DRY), so this task adds `tsx` (dev-only, zero production impact) to let the script import the real `.ts` modules directly.

- [ ] **Step 1: Add `tsx` as a dev dependency**

```bash
npm install -D tsx
```

- [ ] **Step 2: Write the script**

Create `ops/text-overlay-prototype.mjs`:

```js
#!/usr/bin/env node
/**
 * Manual visual prototype for the app-side text-overlay pipeline.
 * Generates a fresh "Espresso Yourself" mascot image via Recraft, ensures it
 * has an alpha channel, composites the phrase onto it, and writes the result
 * to disk for visual inspection.
 *
 * Usage: node --env-file=.env.local --import tsx ops/text-overlay-prototype.mjs
 */
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { recraftGenerate, removeBackground } from '../src/lib/recraft.ts';
import { hasAlphaChannel } from '../src/lib/printify.ts';
import { applyTextOverlay } from '../src/lib/textOverlay.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROMPT = `Anthropic-style vector illustration of an anthropomorphic coffee mug mascot character, teal ceramic mug with a bold cartoon face (wide open mouth, expressive eyes, one arm raised in a triumphant fist pump), fully contained within frame with even margin on all sides, mug sits on a pile of scattered coffee beans, coffee beans floating around the character, dynamic coffee splash swirl in the background upper-left, bold black outlines, flat vibrant color palette (teal, cream, dark brown, soft pink), comic/cartoon sticker style, clean vector linework, high contrast, centered composition, isolated on transparent background, no text, no lettering, no watermark`;

const PHRASE = 'ESPRESSO YOURSELF';
const OUTPUT_PATH = join(__dirname, 'text-overlay-prototype-output.png');
const FONT_PATH = join(__dirname, '..', 'src', 'lib', 'fonts', 'LuckiestGuy-Regular.ttf');

async function run() {
  console.log('Generating art from Recraft...');
  const result = await recraftGenerate({ prompt: PROMPT, productCategory: 'mug', n: 1, size: '1024x1024' });
  let sourceUrl = result.data?.[0]?.url;
  if (!sourceUrl) throw new Error('Recraft returned no image URL');

  let res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status}`);
  let artBuffer = Buffer.from(await res.arrayBuffer());

  if (!(await hasAlphaChannel(artBuffer))) {
    console.log('No alpha channel detected, removing background...');
    sourceUrl = await removeBackground(sourceUrl);
    res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to fetch background-removed image: ${res.status}`);
    artBuffer = Buffer.from(await res.arrayBuffer());
  }

  console.log('Compositing text overlay...');
  const fontBuffer = readFileSync(FONT_PATH);
  const output = await applyTextOverlay(artBuffer, PHRASE, fontBuffer);

  writeFileSync(OUTPUT_PATH, output);
  console.log(`Done. Wrote ${OUTPUT_PATH}`);
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Ignore the generated output file**

Add to `.gitignore`:
```
ops/text-overlay-prototype-output.png
```

- [ ] **Step 4: Run it and visually verify**

Run: `node --env-file=.env.local --import tsx ops/text-overlay-prototype.mjs`
Expected: console prints `Generating art from Recraft...`, then either nothing or the no-alpha fallback line, then `Compositing text overlay...`, then `Done. Wrote .../ops/text-overlay-prototype-output.png`.

Then visually inspect `ops/text-overlay-prototype-output.png` (e.g. via the Read tool, which supports images) and confirm: the mascot art matches the prompt, the phrase "ESPRESSO YOURSELF" is legible, positioned above the art without overlapping it, sized proportionally to the canvas, and has a visible stroke/outline for contrast against the background.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json ops/text-overlay-prototype.mjs .gitignore
git commit -m "chore: add manual text-overlay pipeline prototype script"
```

---

## Self-Review

**Spec coverage** (against the reviewed planning doc, app-side scope):
- Art-only Recraft prompt, reused verbatim → Task 3, `PROMPT` constant. ✓
- Alpha-channel bounding-box detection, dynamic not fixed-coordinate → Task 2, `getArtBoundingBox` (uses `sharp().trim()`, empirically verified offset sign convention). ✓
- Safe-zone / text-zone layout → Task 2, `computeTextZone`. ✓ (percentage-based margin instead of the doc's fixed 150px/1200px, since those were calibrated for a 4500x5400 print canvas the app doesn't generate at directly — see Architecture note.)
- Auto-fit font sizing for varying phrase length → Task 1, `renderTextToSvg`'s reference-size/scale approach, tested with both a 2-char and 24-char phrase against the same box. ✓
- Text rendered as its own layer, composited preserving alpha → Task 2, `compositeTextOverArt`. ✓
- Stroke/outline for contrast rather than fill-only → Task 1, default `stroke`/`strokeWidth` params. ✓
- Font licensing confirmed → Task 1 step 1 note (Luckiest Guy, OFL). ✓
- "IF no alpha, branch to background-removal" → Task 3 script, `hasAlphaChannel` + `removeBackground` fallback. ✓
- Upscale-before-text (doc step 3) and n8n pipeline wiring / Docker deployment process (doc's later sections) → deliberately out of scope, see below.

**Placeholder scan:** no TBD/TODO markers; every step has real, complete code.

**Type consistency:** `applyTextOverlay(artBuffer, phrase, fontBuffer)` signature matches its Task 2 test calls and its Task 3 script call. `renderTextToSvg`'s `RenderedText`/`RenderTextOptions` names match between Task 1's implementation and Task 2's import/usage. `BoundingBox`/`TextZone` field names (`left/top/width/height`, `x/y/width/height`) are consistent across `getArtBoundingBox`, `computeTextZone`, and their tests.

## Out of Scope (deliberate, not deferred by oversight)

- **Wiring into `src/app/api/n8n/create-asset/route.ts`.** This plan stops at a working, tested engine + a visually-verifiable prototype script, per the user's explicit choice to validate on one niche before generalizing. Once the prototype output looks right, route-wiring is a small follow-up: add optional `phrase` to the request body parsing, call `applyTextOverlay(png, phrase, fontBuffer)` after the existing background-removal step and before `uploadPngAndGetUrl` (route.ts lines ~258–261), and load `fontBuffer` once at module scope via `fs.readFileSync`.
- **`next.config.js` `outputFileTracingIncludes` fix.** Needed only once the font is read at runtime from a deployed (standalone-build) API route, i.e. only when the route-wiring follow-up above happens. Verified in advance: the correct config is a **top-level** (not `experimental.`) key with **no `/route` suffix** — `outputFileTracingIncludes: { '/api/n8n/create-asset': ['./src/lib/fonts/**'] }` — confirmed against a real Next 16.1.6 build; the `/route`-suffixed key silently drops the font. Verify after adding it with `find .next/standalone -iname '*.ttf'`.
- **Generalizing across all 5 niches** (palette-aware stroke contrast, phrase source wiring through the n8n Google Sheet, upscale-before-text ordering, Docker/env deployment process from the doc's later sections) — explicitly deferred until the one-niche prototype is visually approved.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-13-text-overlay-app-side.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
