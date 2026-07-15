# Text-Overlay Aesthetic Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the composited on-design text's font and color actually relate to each generated image, instead of the single hardcoded font (`LuckiestGuy-Regular.ttf`) and fixed colors (`#2C2C2A`/`#FFFFFF`) used today for every asset.

**Architecture:** Two new independent analysis modules — `artStyleAnalysis.ts` (GPT-4o vision picks a font category from a fixed 5-value enum, using the image plus `colorPalette`/`styleTag` as context) and `colorExtraction.ts` (pixel-samples the actual rendered art for a fill/stroke pair). A small orchestrator, `textOverlayStyling.ts`, runs both in parallel and resolves a font buffer via a new `fontLibrary.ts` lookup. `textOverlay.ts`'s existing `applyTextOverlay`/`applyTextOverlayWithFallback` gain optional font/color parameters (backward compatible — no existing call site passes more than 3 positional args). `create-asset/route.ts` wires the orchestrator in at the existing `if (phrase)` gate.

**Tech Stack:** TypeScript, Vitest, `sharp` (pixel sampling), `openai` SDK (GPT-4o vision via Chat Completions), `opentype.js` (existing, unchanged).

## Global Constraints

- Every failure path must fall back to today's exact defaults (`bold-display` font category → `LuckiestGuy-Regular.ttf`; `#2C2C2A` fill / `#FFFFFF` stroke) — never block or degrade asset generation. (Spec: Error Handling)
- Applies to new asset generations only — no retroactive reprocessing of existing assets (confirmed infeasible: `create-asset/route.ts` composites text in-place and only uploads the final buffer, so pre-overlay art for existing assets no longer exists anywhere). (Spec: Retroactive Reprocessing, revised during planning)
- No changes to `getArtBoundingBox`, `computeTextZone`, `compositeTextOverArt`, or `shrinkArtForTextZone` in `textOverlay.ts`. (Spec: Non-Goals)
- Font category set is fixed at exactly 5 values for this plan: `bold-display`, `elegant-serif`, `playful-script`, `vintage-distressed`, `minimal-sans`. (Spec: Architecture)
- All new font files must be OFL-licensed (Google Fonts), matching the existing `LuckiestGuy-Regular.ttf` convention.
- `next.config.js`'s `outputFileTracingIncludes` already globs `./src/lib/fonts/**` — confirmed during planning, no config change needed for new font files to reach the standalone build.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/frontend/src/lib/colorExtraction.ts` (new) | Pixel-sample the art region for a dominant color; derive a legible fill/stroke pair. Pure, no network. |
| `apps/frontend/src/lib/colorExtraction.test.ts` (new) | Unit tests with synthetic `sharp`-built PNGs. |
| `apps/frontend/src/lib/artStyleAnalysis.ts` (new) | Call GPT-4o vision to classify the image into one of 5 font categories, using sheet context. |
| `apps/frontend/src/lib/artStyleAnalysis.test.ts` (new) | Unit tests mocking the `openai` client. |
| `apps/frontend/src/lib/fonts/CrimsonText-Bold.ttf`, `Pacifico-Regular.ttf`, `Rye-Regular.ttf`, `Poppins-Bold.ttf` (new binaries) | OFL-licensed fonts for the 4 new categories. |
| `apps/frontend/src/lib/fontLibrary.ts` (new) | Maps a `FontCategory` to its bundled font file buffer. |
| `apps/frontend/src/lib/fontLibrary.test.ts` (new) | Confirms every category loads a valid, parseable font. |
| `apps/frontend/src/lib/textOverlayStyling.ts` (new) | Orchestrator: runs style analysis + color extraction in parallel, resolves the font buffer. |
| `apps/frontend/src/lib/textOverlayStyling.test.ts` (new) | Unit tests mocking `artStyleAnalysis`/`colorExtraction`, proving the fallback chain surfaces safe defaults. |
| `apps/frontend/src/lib/textOverlay.ts` (modify) | `applyTextOverlay`/`applyTextOverlayWithFallback` gain an optional `colors` parameter threaded to `renderTextToSvg`. |
| `apps/frontend/src/lib/textOverlay.test.ts` (modify) | Extend with cases covering custom font/colors. |
| `apps/frontend/src/app/api/n8n/create-asset/route.ts` (modify) | Extract `colorPalette` from the request body; call `resolveOverlayStyle` before compositing. |
| `apps/frontend/ops/text-overlay-prototype.mjs` (modify) | Print the resolved font category and colors for manual visual inspection. |

**Why a separate `textOverlayStyling.ts` orchestrator (deviation from the design doc's plan to test this at the route level):** planning surfaced that this repo has zero existing route-level tests (no test harness mocks `adminDb`/`adminBucket`/`recraft` anywhere) — building one just for this feature would be a disproportionately large, one-off addition. Isolating the "resolve font + colors, with fallback" logic into its own small function keeps it unit-testable the same way every other `lib/` module in this codebase already is, without inventing new test infrastructure. `route.ts`'s existing `create_asset.text_overlay_failed` catch block still covers it end-to-end.

---

### Task 1: Color extraction

**Files:**
- Create: `apps/frontend/src/lib/colorExtraction.ts`
- Test: `apps/frontend/src/lib/colorExtraction.test.ts`

**Interfaces:**
- Consumes: `getArtBoundingBox` from `./textOverlay` (existing, exported).
- Produces: `deriveTextColors(artBuffer: Buffer): Promise<{ fill: string; stroke: string }>` — used by Task 5's orchestrator.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/frontend/src/lib/colorExtraction.test.ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { deriveTextColors } from './colorExtraction';

async function solidCanvas(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 200, channels: 4, background: { r, g, b, alpha: 1 } },
  }).png().toBuffer();
}

describe('deriveTextColors', () => {
  it('picks a white fill with black stroke for a dark image', async () => {
    const canvas = await solidCanvas(0, 0, 0);
    const result = await deriveTextColors(canvas);
    expect(result).toEqual({ fill: '#FFFFFF', stroke: '#000000' });
  });

  it('picks a black fill with white stroke for a light image', async () => {
    const canvas = await solidCanvas(255, 255, 255);
    const result = await deriveTextColors(canvas);
    expect(result).toEqual({ fill: '#000000', stroke: '#FFFFFF' });
  });

  it('falls back to the default pair when extraction fails', async () => {
    const invalidBuffer = Buffer.from('not a real image');
    const result = await deriveTextColors(invalidBuffer);
    expect(result).toEqual({ fill: '#2C2C2A', stroke: '#FFFFFF' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/colorExtraction.test.ts`
Expected: FAIL — `Cannot find module './colorExtraction'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/frontend/src/lib/colorExtraction.ts
import sharp from 'sharp';
import { getArtBoundingBox } from './textOverlay';

export interface ColorPair {
  fill: string;
  stroke: string;
}

const DEFAULT_FILL = '#2C2C2A';
const DEFAULT_STROKE = '#FFFFFF';

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

interface Rgb {
  r: number;
  g: number;
  b: number;
}

async function extractDominantColor(artBuffer: Buffer): Promise<Rgb> {
  const box = await getArtBoundingBox(artBuffer);
  const region = await sharp(artBuffer)
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(1, 1, { fit: 'fill' })
    .raw()
    .toBuffer();
  return { r: region[0], g: region[1], b: region[2] };
}

function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const srgb = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/colorExtraction.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/colorExtraction.ts apps/frontend/src/lib/colorExtraction.test.ts
git commit -m "feat: add pixel-based text color extraction"
```

---

### Task 2: Font-style classification via GPT-4o vision

**Files:**
- Create: `apps/frontend/src/lib/artStyleAnalysis.ts`
- Test: `apps/frontend/src/lib/artStyleAnalysis.test.ts`

**Interfaces:**
- Consumes: `openai` from `./openai` (existing Proxy-wrapped client).
- Produces: `FontCategory` type, `FONT_CATEGORIES` array, `classifyFontCategory(imageBuffer: Buffer, context?: { colorPalette?: string; styleTag?: string }): Promise<FontCategory>` — used by Task 3 (`fontLibrary.ts` keys off `FontCategory`) and Task 5.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/frontend/src/lib/artStyleAnalysis.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./openai', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}));

import { openai } from './openai';
import { classifyFontCategory } from './artStyleAnalysis';

const mockCreate = openai.chat.completions.create as unknown as ReturnType<typeof vi.fn>;

describe('classifyFontCategory', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns the category GPT responds with when it is valid', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'elegant-serif' } }] });
    const result = await classifyFontCategory(Buffer.from('fake-png'), {});
    expect(result).toBe('elegant-serif');
  });

  it('falls back to bold-display when GPT returns something outside the fixed category list', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'comic-sans-vibes' } }] });
    const result = await classifyFontCategory(Buffer.from('fake-png'), {});
    expect(result).toBe('bold-display');
  });

  it('falls back to bold-display when the OpenAI call throws', async () => {
    mockCreate.mockRejectedValue(new Error('network error'));
    const result = await classifyFontCategory(Buffer.from('fake-png'), {});
    expect(result).toBe('bold-display');
  });

  it('includes colorPalette and styleTag context in the prompt when provided', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'vintage-distressed' } }] });
    await classifyFontCategory(Buffer.from('fake-png'), { colorPalette: 'sunset', styleTag: 'vintage-badge' });
    const callArgs = mockCreate.mock.calls[0][0];
    const promptText = callArgs.messages[0].content[0].text;
    expect(promptText).toContain('sunset');
    expect(promptText).toContain('vintage-badge');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/artStyleAnalysis.test.ts`
Expected: FAIL — `Cannot find module './artStyleAnalysis'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/frontend/src/lib/artStyleAnalysis.ts
import { openai } from './openai';

export type FontCategory =
  | 'bold-display'
  | 'elegant-serif'
  | 'playful-script'
  | 'vintage-distressed'
  | 'minimal-sans';

export const FONT_CATEGORIES: FontCategory[] = [
  'bold-display',
  'elegant-serif',
  'playful-script',
  'vintage-distressed',
  'minimal-sans',
];

const DEFAULT_CATEGORY: FontCategory = 'bold-display';

export interface StyleAnalysisContext {
  colorPalette?: string;
  styleTag?: string;
}

function isFontCategory(value: unknown): value is FontCategory {
  return typeof value === 'string' && (FONT_CATEGORIES as string[]).includes(value);
}

export async function classifyFontCategory(
  imageBuffer: Buffer,
  context: StyleAnalysisContext = {},
): Promise<FontCategory> {
  try {
    const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    const promptText =
      `Classify this merch design's visual style into exactly one category from this list: ${FONT_CATEGORIES.join(', ')}.\n` +
      `Intended color palette: ${context.colorPalette || 'unspecified'}. Intended style tag: ${context.styleTag || 'unspecified'}.\n` +
      'Respond with only the category name, nothing else.';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 20,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    return isFontCategory(raw) ? raw : DEFAULT_CATEGORY;
  } catch {
    return DEFAULT_CATEGORY;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/artStyleAnalysis.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/artStyleAnalysis.ts apps/frontend/src/lib/artStyleAnalysis.test.ts
git commit -m "feat: add GPT-4o vision font-style classification"
```

---

### Task 3: Font library — source 4 new fonts, add lookup module

**Files:**
- Create (binary): `apps/frontend/src/lib/fonts/CrimsonText-Bold.ttf`, `apps/frontend/src/lib/fonts/Pacifico-Regular.ttf`, `apps/frontend/src/lib/fonts/Rye-Regular.ttf`, `apps/frontend/src/lib/fonts/Poppins-Bold.ttf`
- Create: `apps/frontend/src/lib/fontLibrary.ts`
- Test: `apps/frontend/src/lib/fontLibrary.test.ts`

**Interfaces:**
- Consumes: `FontCategory` from `./artStyleAnalysis` (Task 2).
- Produces: `loadFontForCategory(category: FontCategory): Buffer` — used by Task 5.

- [ ] **Step 1: Download the 4 new OFL-licensed fonts (URLs verified during planning, all return 200)**

```bash
cd apps/frontend/src/lib/fonts
curl -sL -o CrimsonText-Bold.ttf "https://github.com/google/fonts/raw/main/ofl/crimsontext/CrimsonText-Bold.ttf"
curl -sL -o Pacifico-Regular.ttf "https://github.com/google/fonts/raw/main/ofl/pacifico/Pacifico-Regular.ttf"
curl -sL -o Rye-Regular.ttf "https://github.com/google/fonts/raw/main/ofl/rye/Rye-Regular.ttf"
curl -sL -o Poppins-Bold.ttf "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf"
ls -la CrimsonText-Bold.ttf Pacifico-Regular.ttf Rye-Regular.ttf Poppins-Bold.ttf
```

Expected: all 4 files present, each several KB to ~150KB (not a 404 HTML error page — sanity-check with `file CrimsonText-Bold.ttf` etc., expect `TrueType Font data`).

If any URL 404s by the time this is run (repo layout can change), fetch the family directly from `https://fonts.google.com/specimen/<Family Name>` instead, download the family zip, and extract the matching static weight — verify the resulting file is OFL-licensed (check for an `OFL.txt` in the zip) before using it.

- [ ] **Step 2: Write the failing test**

```typescript
// apps/frontend/src/lib/fontLibrary.test.ts
import { describe, it, expect } from 'vitest';
import opentype from 'opentype.js';
import { loadFontForCategory } from './fontLibrary';
import { FONT_CATEGORIES } from './artStyleAnalysis';

describe('loadFontForCategory', () => {
  it.each(FONT_CATEGORIES)('loads a valid, parseable font for category "%s"', (category) => {
    const buffer = loadFontForCategory(category);
    expect(buffer.length).toBeGreaterThan(0);
    expect(() => opentype.parse(buffer)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/lib/fontLibrary.test.ts`
Expected: FAIL — `Cannot find module './fontLibrary'`

- [ ] **Step 4: Write the implementation**

```typescript
// apps/frontend/src/lib/fontLibrary.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import type { FontCategory } from './artStyleAnalysis';

const FONT_FILES: Record<FontCategory, string> = {
  'bold-display': 'LuckiestGuy-Regular.ttf',
  'elegant-serif': 'CrimsonText-Bold.ttf',
  'playful-script': 'Pacifico-Regular.ttf',
  'vintage-distressed': 'Rye-Regular.ttf',
  'minimal-sans': 'Poppins-Bold.ttf',
};

const cache = new Map<FontCategory, Buffer>();

export function loadFontForCategory(category: FontCategory): Buffer {
  const cached = cache.get(category);
  if (cached) return cached;

  const buffer = readFileSync(join(__dirname, 'fonts', FONT_FILES[category]));
  cache.set(category, buffer);
  return buffer;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/lib/fontLibrary.test.ts`
Expected: PASS (5/5 — one per category)

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/lib/fonts/CrimsonText-Bold.ttf apps/frontend/src/lib/fonts/Pacifico-Regular.ttf apps/frontend/src/lib/fonts/Rye-Regular.ttf apps/frontend/src/lib/fonts/Poppins-Bold.ttf apps/frontend/src/lib/fontLibrary.ts apps/frontend/src/lib/fontLibrary.test.ts
git commit -m "feat: add 4 new OFL fonts and category lookup module"
```

---

### Task 4: Thread font/colors through `textOverlay.ts`

**Files:**
- Modify: `apps/frontend/src/lib/textOverlay.ts`
- Test: `apps/frontend/src/lib/textOverlay.test.ts`

**Interfaces:**
- Produces: `applyTextOverlay(artBuffer, phrase, fontBuffer, colors?: { fill?: string; stroke?: string })`, `applyTextOverlayWithFallback(artBuffer, phrase, fontBuffer, colors?, shrinkScale?)` — used by Task 6.
- Backward compatible: `colors` defaults to `{}`, which `renderTextToSvg` already treats as "use its own defaults" (`fill = '#2C2C2A'`, `stroke = '#FFFFFF'`, unchanged in `textRender.ts`). No existing call site passes more than 3 positional args (verified during planning via grep across the whole repo), so this is a non-breaking signature change.

- [ ] **Step 1: Write the failing test**

Add to the end of `apps/frontend/src/lib/textOverlay.test.ts` (existing `describe('applyTextOverlay', ...)` block — add as a new `it` inside it):

```typescript
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

    expect(withCustomColors.equals(withDefaults)).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlay.test.ts`
Expected: FAIL — TypeScript error, `applyTextOverlay` does not accept a 4th argument yet (or a runtime pass-through mismatch if TS isn't strict-checked at test time).

- [ ] **Step 3: Modify the implementation**

In `apps/frontend/src/lib/textOverlay.ts`, replace the `applyTextOverlay` and `applyTextOverlayWithFallback` functions (currently the last two exported functions in the file) with:

```typescript
export interface OverlayColors {
  fill?: string;
  stroke?: string;
}

export async function applyTextOverlay(
  artBuffer: Buffer,
  phrase: string,
  fontBuffer: Buffer,
  colors: OverlayColors = {},
): Promise<Buffer> {
  const meta = await sharp(artBuffer).metadata();
  const canvasWidth = meta.width ?? 0;
  const canvasHeight = meta.height ?? 0;

  const artBox = await getArtBoundingBox(artBuffer);
  const marginPx = Math.round(Math.min(canvasWidth, canvasHeight) * 0.04);
  const zone = computeTextZone(canvasWidth, canvasHeight, artBox, marginPx);

  if (zone.height <= 0 || zone.width <= 0) return artBuffer;

  const font = loadFont(fontBuffer);
  const rendered = renderTextToSvg(font, phrase, {
    maxWidth: zone.width,
    maxHeight: zone.height,
    fill: colors.fill,
    stroke: colors.stroke,
  });
  const textPng = await sharp(rendered.svg).png().toBuffer();

  return compositeTextOverArt(artBuffer, textPng, zone);
}

// Combines applyTextOverlay with the shrinkArtForTextZone fallback: try the
// natural bounding box first, and only shrink if Recraft left no real room.
// Single source of truth for this retry so callers (the batch route, the
// manual prototype script) don't duplicate the fallback logic.
export async function applyTextOverlayWithFallback(
  artBuffer: Buffer,
  phrase: string,
  fontBuffer: Buffer,
  colors: OverlayColors = {},
  shrinkScale = 0.75,
): Promise<Buffer> {
  const output = await applyTextOverlay(artBuffer, phrase, fontBuffer, colors);
  if (!output.equals(artBuffer)) return output;

  const shrunk = await shrinkArtForTextZone(artBuffer, shrinkScale);
  return applyTextOverlay(shrunk, phrase, fontBuffer, colors);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlay.test.ts`
Expected: PASS (all existing cases + the new one)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/textOverlay.ts apps/frontend/src/lib/textOverlay.test.ts
git commit -m "feat: thread custom font colors through text overlay compositing"
```

---

### Task 5: Overlay style orchestrator

**Files:**
- Create: `apps/frontend/src/lib/textOverlayStyling.ts`
- Test: `apps/frontend/src/lib/textOverlayStyling.test.ts`

**Interfaces:**
- Consumes: `classifyFontCategory` from `./artStyleAnalysis` (Task 2), `deriveTextColors` from `./colorExtraction` (Task 1), `loadFontForCategory` from `./fontLibrary` (Task 3).
- Produces: `resolveOverlayStyle(imageBuffer: Buffer, context?: StyleAnalysisContext): Promise<{ fontBuffer: Buffer; fill: string; stroke: string }>` — used by Task 6.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/frontend/src/lib/textOverlayStyling.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./artStyleAnalysis', async () => {
  const actual = await vi.importActual<typeof import('./artStyleAnalysis')>('./artStyleAnalysis');
  return { ...actual, classifyFontCategory: vi.fn() };
});
vi.mock('./colorExtraction', () => ({ deriveTextColors: vi.fn() }));

import { classifyFontCategory } from './artStyleAnalysis';
import { deriveTextColors } from './colorExtraction';
import { resolveOverlayStyle } from './textOverlayStyling';

const mockClassify = classifyFontCategory as unknown as ReturnType<typeof vi.fn>;
const mockDeriveColors = deriveTextColors as unknown as ReturnType<typeof vi.fn>;

describe('resolveOverlayStyle', () => {
  beforeEach(() => {
    mockClassify.mockReset();
    mockDeriveColors.mockReset();
  });

  it('resolves the font buffer and colors returned by style analysis and color extraction', async () => {
    mockClassify.mockResolvedValue('elegant-serif');
    mockDeriveColors.mockResolvedValue({ fill: '#111111', stroke: '#EEEEEE' });

    const result = await resolveOverlayStyle(Buffer.from('fake-png'));

    expect(result.fill).toBe('#111111');
    expect(result.stroke).toBe('#EEEEEE');
    expect(result.fontBuffer.length).toBeGreaterThan(0);
  });

  it('surfaces the safe defaults when both underlying analyses report their own fallback', async () => {
    // classifyFontCategory/deriveTextColors already self-fallback internally
    // on failure (Tasks 1-2); this proves resolveOverlayStyle passes those
    // safe defaults through correctly rather than throwing.
    mockClassify.mockResolvedValue('bold-display');
    mockDeriveColors.mockResolvedValue({ fill: '#2C2C2A', stroke: '#FFFFFF' });

    const result = await resolveOverlayStyle(Buffer.from('fake-png'));

    expect(result.fill).toBe('#2C2C2A');
    expect(result.stroke).toBe('#FFFFFF');
  });

  it('passes colorPalette and styleTag context through to classifyFontCategory', async () => {
    mockClassify.mockResolvedValue('bold-display');
    mockDeriveColors.mockResolvedValue({ fill: '#2C2C2A', stroke: '#FFFFFF' });

    await resolveOverlayStyle(Buffer.from('fake-png'), { colorPalette: 'neon', styleTag: 'cyberpunk' });

    expect(mockClassify).toHaveBeenCalledWith(
      expect.any(Buffer),
      { colorPalette: 'neon', styleTag: 'cyberpunk' },
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlayStyling.test.ts`
Expected: FAIL — `Cannot find module './textOverlayStyling'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/frontend/src/lib/textOverlayStyling.ts
import { classifyFontCategory, type StyleAnalysisContext } from './artStyleAnalysis';
import { deriveTextColors } from './colorExtraction';
import { loadFontForCategory } from './fontLibrary';

export interface ResolvedOverlayStyle {
  fontBuffer: Buffer;
  fill: string;
  stroke: string;
}

export async function resolveOverlayStyle(
  imageBuffer: Buffer,
  context: StyleAnalysisContext = {},
): Promise<ResolvedOverlayStyle> {
  const [category, colors] = await Promise.all([
    classifyFontCategory(imageBuffer, context),
    deriveTextColors(imageBuffer),
  ]);

  return {
    fontBuffer: loadFontForCategory(category),
    fill: colors.fill,
    stroke: colors.stroke,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlayStyling.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/textOverlayStyling.ts apps/frontend/src/lib/textOverlayStyling.test.ts
git commit -m "feat: add overlay style orchestrator combining font and color analysis"
```

---

### Task 6: Wire into `create-asset/route.ts`

**Files:**
- Modify: `apps/frontend/src/app/api/n8n/create-asset/route.ts`

**Interfaces:**
- Consumes: `resolveOverlayStyle` from `@/lib/textOverlayStyling` (Task 5), `applyTextOverlayWithFallback` from `@/lib/textOverlay` (Task 4, already imported).

- [ ] **Step 1: Remove the single hardcoded font load**

In `apps/frontend/src/app/api/n8n/create-asset/route.ts`, remove these lines (currently lines 5-6 and 15):

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
```

```typescript
// Bundled at build time (see docs/superpowers/plans/2026-07-13-text-overlay-app-side.md).
// next.config.js's outputFileTracingIncludes keeps this present in standalone builds.
const overlayFontBuffer = readFileSync(join(process.cwd(), 'src/lib/fonts/LuckiestGuy-Regular.ttf'));
```

(Verified during planning: `readFileSync`/`join` are used nowhere else in this file.)

- [ ] **Step 2: Add the `resolveOverlayStyle` import**

Add alongside the existing `applyTextOverlayWithFallback` import:

```typescript
import { applyTextOverlayWithFallback } from '@/lib/textOverlay';
import { resolveOverlayStyle } from '@/lib/textOverlayStyling';
```

- [ ] **Step 3: Extract `colorPalette` from the request body**

Find this line (currently line 103):

```typescript
const style = body.style ? body.style.toString() : '';
```

Add immediately after it:

```typescript
const colorPalette = body.colorPalette ? body.colorPalette.toString() : '';
```

- [ ] **Step 4: Replace the overlay call to resolve style dynamically**

Find this block (currently lines 269-275):

```typescript
      if (phrase) {
        try {
          png = await applyTextOverlayWithFallback(png, phrase, overlayFontBuffer);
        } catch (overlayErr: any) {
          log('create_asset.text_overlay_failed', { requestId, rowId, message: String(overlayErr?.message) });
        }
      }
```

Replace with:

```typescript
      if (phrase) {
        try {
          const overlayStyle = await resolveOverlayStyle(png, { colorPalette, styleTag: style });
          png = await applyTextOverlayWithFallback(png, phrase, overlayStyle.fontBuffer, {
            fill: overlayStyle.fill,
            stroke: overlayStyle.stroke,
          });
        } catch (overlayErr: any) {
          log('create_asset.text_overlay_failed', { requestId, rowId, message: String(overlayErr?.message) });
        }
      }
```

(Note: `classifyFontCategory` and `deriveTextColors` inside `resolveOverlayStyle` already catch their own failures and return safe defaults — this outer `try/catch` only fires on a genuine `loadFontForCategory` failure, e.g. a missing bundled font file, which is a real deploy-time misconfiguration worth logging, not a per-request condition to silently swallow deeper.)

- [ ] **Step 5: Verify the route still type-checks and builds**

Run: `cd apps/frontend && npm run build`
Expected: build succeeds with no new TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/api/n8n/create-asset/route.ts
git commit -m "feat: wire style-aware font/color resolution into create-asset route"
```

---

### Task 7: Update the manual visual-inspection script

**Files:**
- Modify: `apps/frontend/ops/text-overlay-prototype.mjs`

- [ ] **Step 1: Read the current script's overlay call**

Find (currently line 49):

```javascript
const output = await applyTextOverlayWithFallback(artBuffer, PHRASE, fontBuffer);
```

- [ ] **Step 2: Replace with style resolution + logging**

```javascript
import { resolveOverlayStyle } from '../src/lib/textOverlayStyling.ts';
```

Add this import near the top alongside the existing `applyTextOverlayWithFallback` import, then replace the call:

```javascript
const overlayStyle = await resolveOverlayStyle(artBuffer);
console.log(`Resolved style: fill=${overlayStyle.fill} stroke=${overlayStyle.stroke}`);
const output = await applyTextOverlayWithFallback(artBuffer, PHRASE, overlayStyle.fontBuffer, {
  fill: overlayStyle.fill,
  stroke: overlayStyle.stroke,
});
```

- [ ] **Step 3: Run the script manually against a real generation to eyeball the result**

Run: `cd apps/frontend && node --env-file=.env.local --import tsx ops/text-overlay-prototype.mjs`
Expected: script prints the resolved category/colors and writes a PNG; open it to confirm the text visually relates to the art (this is a manual judgment call, not an automated assertion).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/ops/text-overlay-prototype.mjs
git commit -m "chore: print resolved font/color style in text-overlay prototype script"
```

---

## Self-Review Notes

- **Spec coverage:** Font classification (Task 2), color extraction (Task 1), font library extensibility (Task 3, 5 categories with room to grow), fallback safety (Tasks 1/2/5 all self-fallback, Task 6 preserves the outer catch), route wiring (Task 6), manual visual verification (Task 7, per spec's "E2E out of scope, extend the ops script" note) — all covered.
- **Dropped from the original design doc's scope during planning, with reasoning documented:** the ~9-10 asset retroactive reprocess (confirmed infeasible — pre-overlay art isn't retained anywhere, user chose to drop it rather than pay for full regeneration) and the route-level integration test (no existing test harness for this route; replaced with the equivalent-coverage `textOverlayStyling.test.ts` unit tests).
- **Type consistency:** `FontCategory` (Task 2) flows unchanged into `fontLibrary.ts` (Task 3) and `textOverlayStyling.ts` (Task 5); `OverlayColors` (Task 4) matches the `{ fill, stroke }` shape `deriveTextColors` (Task 1) and `resolveOverlayStyle` (Task 5) both produce; `StyleAnalysisContext` (Task 2) is reused as-is by `resolveOverlayStyle` (Task 5) and `route.ts` (Task 6) — no renamed duplicates.
