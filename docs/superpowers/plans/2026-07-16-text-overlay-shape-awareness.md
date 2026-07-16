# Text-Overlay Shape Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when generated art is circular/badge-shaped and render the phrase as a top arc that follows the badge's curve, instead of the straight-line-in-margin approach that today shrinks the art 25% and leaves an awkward dead-space gap on round designs.

**Architecture:** `artStyleAnalysis.ts`'s existing GPT-4o vision call (currently `classifyFontCategory`, returning only a font category) is renamed to `analyzeArtStyle` and extended to return `{fontCategory, shape}` from one combined JSON response — no second API call. `textRender.ts` gains `renderArcedTextToSvg`, which lays `opentype.js` glyph paths individually along a computed arc (radius = a fixed proportion of the available zone width), throwing `ArcTextTooSmallError` if the phrase can't fit above a minimum legible size. `textOverlayStyling.ts` threads the detected `shape` through. `textOverlay.ts`'s `applyTextOverlay`/`applyTextOverlayWithFallback` gain a `shape` parameter: `circular` tries the arc renderer first (falling back to today's shrink+straight-line path on overflow, never retrying the arc); `rectangular` is completely unchanged. `create-asset/route.ts` passes the field through.

**Tech Stack:** TypeScript, Vitest, `opentype.js` (existing, glyph path extraction), `sharp` (existing, compositing), `openai` SDK (GPT-4o vision, `response_format: json_object`).

## Global Constraints

- Shape enum is fixed at exactly 2 values for this plan: `circular`, `rectangular`. (Spec: Decisions — Shape enum)
- Every failure path must fall back to today's exact defaults — `shape: 'rectangular'` on any classification failure, and the existing shrink+straight-line fallback on arc overflow — never block or degrade asset generation. (Spec: Error Handling)
- Applies to new asset generations only — no retroactive reprocessing of existing assets. (Spec: Explicit Scope Boundaries)
- No changes to `getArtBoundingBox`, `computeTextZone`, `compositeTextOverArt`, or `shrinkArtForTextZone` in `textOverlay.ts` — all reused exactly as they are today. (Spec: Component Changes)
- No Google Sheet/schema changes — shape is inferred purely from the GPT-4o vision call. (Spec: Explicit Scope Boundaries)
- Arc radius is a fixed proportion of the zone width, not derived from the art's actual detected circle geometry. (Spec: Decisions — Arc geometry)
- Curved text is attempted for every `circular`-classified asset by default — never merely as a second-tier fallback — and the overflow fallback always renders straight-line text, never a second arc attempt. (Spec: Decisions — When to curve / Arc overflow)

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/frontend/src/lib/artStyleAnalysis.ts` (modify) | `classifyFontCategory` → `analyzeArtStyle`; one GPT-4o JSON response now returns both `fontCategory` and `shape`. |
| `apps/frontend/src/lib/artStyleAnalysis.test.ts` (modify) | Update mocks to JSON responses; add shape validation/fallback cases. |
| `apps/frontend/src/lib/textRender.ts` (modify) | Add `renderArcedTextToSvg` (per-glyph top-arc layout) and `ArcTextTooSmallError`. |
| `apps/frontend/src/lib/textRender.test.ts` (modify) | Add arc-rendering tests. |
| `apps/frontend/src/lib/textOverlayStyling.ts` (modify) | Call `analyzeArtStyle`; thread `shape` through `ResolvedOverlayStyle`. |
| `apps/frontend/src/lib/textOverlayStyling.test.ts` (modify) | Update mocks for the combined analysis call; assert `shape` passthrough. |
| `apps/frontend/src/lib/textOverlay.ts` (modify) | `applyTextOverlay`/`applyTextOverlayWithFallback` gain a `shape` parameter; branch to the arc renderer for `circular`, catching overflow and falling back to the existing shrink+straight-line path. |
| `apps/frontend/src/lib/textOverlay.test.ts` (modify) | Add circular-shape rendering, overflow, and fallback-tier tests. |
| `apps/frontend/src/app/api/n8n/create-asset/route.ts` (modify) | Pass `overlayStyle.shape` through to `applyTextOverlayWithFallback`. |
| `apps/frontend/ops/text-overlay-prototype.mjs` (modify) | Generate a circular badge design, print the resolved shape, exercise the new arc path for manual visual verification. |

---

### Task 1: Extend art style analysis to also classify shape

**Files:**
- Modify: `apps/frontend/src/lib/artStyleAnalysis.ts`
- Modify: `apps/frontend/src/lib/artStyleAnalysis.test.ts`

**Interfaces:**
- Consumes: `openai` from `./openai` (existing).
- Produces: `ArtShape` type (`'circular' | 'rectangular'`), `ART_SHAPES` array, `ArtStyleAnalysis` interface (`{fontCategory: FontCategory; shape: ArtShape}`), `analyzeArtStyle(imageBuffer: Buffer, context?: StyleAnalysisContext): Promise<ArtStyleAnalysis>` — used by Task 3. Replaces `classifyFontCategory` (removed; confirmed via repo-wide grep that only `textOverlayStyling.ts` and this test file reference it).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `apps/frontend/src/lib/artStyleAnalysis.test.ts` with:

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
import { analyzeArtStyle } from './artStyleAnalysis';

const mockCreate = openai.chat.completions.create as unknown as ReturnType<typeof vi.fn>;

function mockJsonResponse(content: unknown) {
  mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(content) } }] });
}

describe('analyzeArtStyle', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns the fontCategory and shape GPT responds with when both are valid', async () => {
    mockJsonResponse({ fontCategory: 'elegant-serif', shape: 'circular' });
    const result = await analyzeArtStyle(Buffer.from('fake-png'), {});
    expect(result).toEqual({ fontCategory: 'elegant-serif', shape: 'circular' });
  });

  it('falls back to bold-display when fontCategory is outside the fixed list', async () => {
    mockJsonResponse({ fontCategory: 'comic-sans-vibes', shape: 'rectangular' });
    const result = await analyzeArtStyle(Buffer.from('fake-png'), {});
    expect(result.fontCategory).toBe('bold-display');
    expect(result.shape).toBe('rectangular');
  });

  it('falls back to rectangular when shape is outside the fixed list', async () => {
    mockJsonResponse({ fontCategory: 'minimal-sans', shape: 'hexagonal' });
    const result = await analyzeArtStyle(Buffer.from('fake-png'), {});
    expect(result.fontCategory).toBe('minimal-sans');
    expect(result.shape).toBe('rectangular');
  });

  it('falls back to both defaults when the response is not valid JSON', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'not json at all' } }] });
    const result = await analyzeArtStyle(Buffer.from('fake-png'), {});
    expect(result).toEqual({ fontCategory: 'bold-display', shape: 'rectangular' });
  });

  it('falls back to both defaults when the OpenAI call throws', async () => {
    mockCreate.mockRejectedValue(new Error('network error'));
    const result = await analyzeArtStyle(Buffer.from('fake-png'), {});
    expect(result).toEqual({ fontCategory: 'bold-display', shape: 'rectangular' });
  });

  it('includes colorPalette and styleTag context in the prompt when provided', async () => {
    mockJsonResponse({ fontCategory: 'vintage-distressed', shape: 'rectangular' });
    await analyzeArtStyle(Buffer.from('fake-png'), { colorPalette: 'sunset', styleTag: 'vintage-badge' });
    const callArgs = mockCreate.mock.calls[0][0];
    const promptText = callArgs.messages[0].content[0].text;
    expect(promptText).toContain('sunset');
    expect(promptText).toContain('vintage-badge');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/artStyleAnalysis.test.ts`
Expected: FAIL — `analyzeArtStyle` is not exported from `./artStyleAnalysis` yet.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `apps/frontend/src/lib/artStyleAnalysis.ts` with:

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

export type ArtShape = 'circular' | 'rectangular';

export const ART_SHAPES: ArtShape[] = ['circular', 'rectangular'];

const DEFAULT_CATEGORY: FontCategory = 'bold-display';
const DEFAULT_SHAPE: ArtShape = 'rectangular';

export interface StyleAnalysisContext {
  colorPalette?: string;
  styleTag?: string;
}

export interface ArtStyleAnalysis {
  fontCategory: FontCategory;
  shape: ArtShape;
}

function isFontCategory(value: unknown): value is FontCategory {
  return typeof value === 'string' && (FONT_CATEGORIES as string[]).includes(value);
}

function isArtShape(value: unknown): value is ArtShape {
  return typeof value === 'string' && (ART_SHAPES as string[]).includes(value);
}

export async function analyzeArtStyle(
  imageBuffer: Buffer,
  context: StyleAnalysisContext = {},
): Promise<ArtStyleAnalysis> {
  try {
    const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    const promptText =
      'Analyze this merch design and respond with only a JSON object (no markdown, no extra text) with exactly two keys:\n' +
      `"fontCategory": one of ${FONT_CATEGORIES.join(', ')}\n` +
      `"shape": one of ${ART_SHAPES.join(', ')} — "circular" if the design is a round badge/button/seal/coin shape, "rectangular" for anything else (including shields, banners, or full-bleed art with no distinct outline).\n` +
      `Intended color palette: ${context.colorPalette || 'unspecified'}. Intended style tag: ${context.styleTag || 'unspecified'}.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 50,
      response_format: { type: 'json_object' },
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
    const parsed = raw ? JSON.parse(raw) : {};

    return {
      fontCategory: isFontCategory(parsed.fontCategory) ? parsed.fontCategory : DEFAULT_CATEGORY,
      shape: isArtShape(parsed.shape) ? parsed.shape : DEFAULT_SHAPE,
    };
  } catch {
    return { fontCategory: DEFAULT_CATEGORY, shape: DEFAULT_SHAPE };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/artStyleAnalysis.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/artStyleAnalysis.ts apps/frontend/src/lib/artStyleAnalysis.test.ts
git commit -m "feat: extend art style analysis to also classify circular vs rectangular shape"
```

---

### Task 2: Arced text rendering

**Files:**
- Modify: `apps/frontend/src/lib/textRender.ts`
- Modify: `apps/frontend/src/lib/textRender.test.ts`

**Interfaces:**
- Consumes: `opentype.Font` (existing `loadFont` output), `RenderTextOptions` (existing interface, unchanged).
- Produces: `renderArcedTextToSvg(font: opentype.Font, text: string, options: RenderTextOptions): RenderedText`, `ArcTextTooSmallError` (an `Error` subclass) — both used by Task 4.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/lib/textRender.test.ts`, change the import line (currently line 4):

```typescript
import { loadFont, renderTextToSvg } from './textRender';
```

to:

```typescript
import { loadFont, renderTextToSvg, renderArcedTextToSvg, ArcTextTooSmallError } from './textRender';
```

Then append this new `describe` block at the end of the file:

```typescript
describe('renderArcedTextToSvg', () => {
  const font = loadFont(fontBuffer);

  it('produces an SVG buffer with one glyph group per character', () => {
    const result = renderArcedTextToSvg(font, 'HI', { maxWidth: 400, maxHeight: 200 });
    expect(result.svg.toString('utf-8')).toContain('<g transform=');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('produces more vertical extent than the straight-line renderer for the same text and box', () => {
    const straight = renderTextToSvg(font, 'HELLO WORLD', { maxWidth: 700, maxHeight: 300 });
    const arced = renderArcedTextToSvg(font, 'HELLO WORLD', { maxWidth: 700, maxHeight: 300 });
    expect(arced.height).toBeGreaterThan(straight.height);
  });

  it('throws ArcTextTooSmallError when the phrase cannot fit above the minimum legible size', () => {
    expect(() =>
      renderArcedTextToSvg(font, 'AN EXTREMELY LONG PHRASE THAT DEFINITELY WONT FIT', { maxWidth: 100, maxHeight: 20 }),
    ).toThrow(ArcTextTooSmallError);
  });

  it('throws for an empty phrase', () => {
    expect(() => renderArcedTextToSvg(font, '', { maxWidth: 400, maxHeight: 150 })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/textRender.test.ts`
Expected: FAIL — `renderArcedTextToSvg` is not exported from `./textRender` yet.

- [ ] **Step 3: Write the implementation**

Append to the end of `apps/frontend/src/lib/textRender.ts`:

```typescript
export class ArcTextTooSmallError extends Error {}

const MIN_ARC_FONT_SIZE = 32;
// Radius as a fixed proportion of the available width -- a shallow "top of
// badge" arc, not a geometry derived from the art's actual rim.
const ARC_RADIUS_FACTOR = 1.3;

// Curves opentype.js glyph outlines along a top arc. There is no native SVG
// <text>/<textPath> here (glyphs are raw path outlines, same as
// renderTextToSvg), so each character is measured, positioned at an angle
// proportional to its cumulative advance width, and rotated to sit tangent
// to the arc -- the standard manual circular-text-layout technique.
export function renderArcedTextToSvg(font: opentype.Font, text: string, options: RenderTextOptions): RenderedText {
  const { maxWidth, maxHeight, fill = '#2C2C2A', stroke = '#FFFFFF', strokeWidth = 4 } = options;
  const REFERENCE_SIZE = 200;

  const ref = measureAtSize(font, text, REFERENCE_SIZE);
  if (ref.width <= 0 || ref.height <= 0) {
    throw new Error(`Cannot render empty or zero-width text: "${text}"`);
  }

  // Same box-fit contract as renderTextToSvg's scale formula.
  const scale = Math.min(maxWidth / ref.width, maxHeight / ref.height);
  const fontSize = REFERENCE_SIZE * scale;

  if (fontSize < MIN_ARC_FONT_SIZE) {
    throw new ArcTextTooSmallError(
      `Arced text would render below the minimum legible size (${MIN_ARC_FONT_SIZE}px) for "${text}"`,
    );
  }

  const radius = maxWidth * ARC_RADIUS_FACTOR;
  const chars = Array.from(text);
  const advances = chars.map((ch) => font.getAdvanceWidth(ch, fontSize));
  const totalAdvance = advances.reduce((sum, w) => sum + w, 0);
  const totalAngle = totalAdvance / radius;

  let cumulative = 0;
  const glyphGroups: string[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < chars.length; i++) {
    const advance = advances[i];
    const centerAdvance = cumulative + advance / 2;
    const angle = (centerAdvance / totalAdvance) * totalAngle - totalAngle / 2;
    cumulative += advance;

    // x = -advance/2 centers this glyph's own path on its local origin, so
    // `rotate(deg)` (applied before `translate` in SVG's transform order)
    // spins it in place around its own center rather than around (0,0) of
    // the whole string.
    const glyphPath = font.getPath(chars[i], -advance / 2, 0, fontSize);
    const bbox = glyphPath.getBoundingBox();
    const pathData = glyphPath.toPathData(2);

    const tx = radius * Math.sin(angle);
    const ty = radius - radius * Math.cos(angle);
    const deg = (angle * 180) / Math.PI;

    glyphGroups.push(
      `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${deg.toFixed(2)})">` +
        `<path d="${pathData}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke"/>` +
        `</g>`,
    );

    // Space characters (and similar) have no contours -- opentype.js reports
    // an infinite bounding box for an empty path. Skip those from the
    // overall extent calculation rather than letting Infinity propagate.
    if (Number.isFinite(bbox.x1) && Number.isFinite(bbox.x2) && Number.isFinite(bbox.y1) && Number.isFinite(bbox.y2)) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corners: Array<[number, number]> = [
        [bbox.x1, bbox.y1],
        [bbox.x2, bbox.y1],
        [bbox.x1, bbox.y2],
        [bbox.x2, bbox.y2],
      ];
      for (const [x, y] of corners) {
        const rx = x * cos - y * sin + tx;
        const ry = x * sin + y * cos + ty;
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
        minY = Math.min(minY, ry);
        maxY = Math.max(maxY, ry);
      }
    }
  }

  const width = Math.max(1, Math.round(maxX - minX));
  const height = Math.max(1, Math.round(maxY - minY));

  const svg =
    `<svg width="${width}" height="${height}" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${(maxX - minX).toFixed(2)} ${(maxY - minY).toFixed(2)}" xmlns="http://www.w3.org/2000/svg">` +
    glyphGroups.join('') +
    `</svg>`;

  return { svg: Buffer.from(svg), width, height };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/textRender.test.ts`
Expected: PASS (9/9)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/textRender.ts apps/frontend/src/lib/textRender.test.ts
git commit -m "feat: add arced text rendering for circular badge layouts"
```

---

### Task 3: Thread shape through the overlay style orchestrator

**Files:**
- Modify: `apps/frontend/src/lib/textOverlayStyling.ts`
- Modify: `apps/frontend/src/lib/textOverlayStyling.test.ts`

**Interfaces:**
- Consumes: `analyzeArtStyle`, `type ArtShape` from `./artStyleAnalysis` (Task 1).
- Produces: `ResolvedOverlayStyle` now includes `shape: ArtShape` — used by Task 5.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `apps/frontend/src/lib/textOverlayStyling.test.ts` with:

```typescript
// apps/frontend/src/lib/textOverlayStyling.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./artStyleAnalysis', async () => {
  const actual = await vi.importActual<typeof import('./artStyleAnalysis')>('./artStyleAnalysis');
  return { ...actual, analyzeArtStyle: vi.fn() };
});
vi.mock('./colorExtraction', () => ({ deriveTextColors: vi.fn() }));

import { analyzeArtStyle } from './artStyleAnalysis';
import { deriveTextColors } from './colorExtraction';
import { resolveOverlayStyle } from './textOverlayStyling';

const mockAnalyze = analyzeArtStyle as unknown as ReturnType<typeof vi.fn>;
const mockDeriveColors = deriveTextColors as unknown as ReturnType<typeof vi.fn>;

describe('resolveOverlayStyle', () => {
  beforeEach(() => {
    mockAnalyze.mockReset();
    mockDeriveColors.mockReset();
  });

  it('resolves the font buffer, colors, and shape returned by style analysis and color extraction', async () => {
    mockAnalyze.mockResolvedValue({ fontCategory: 'elegant-serif', shape: 'circular' });
    mockDeriveColors.mockResolvedValue({ fill: '#111111', stroke: '#EEEEEE' });

    const result = await resolveOverlayStyle(Buffer.from('fake-png'));

    expect(result.fill).toBe('#111111');
    expect(result.stroke).toBe('#EEEEEE');
    expect(result.shape).toBe('circular');
    expect(result.fontBuffer.length).toBeGreaterThan(0);
  });

  it('surfaces the safe defaults when the underlying analysis reports its own fallback', async () => {
    mockAnalyze.mockResolvedValue({ fontCategory: 'bold-display', shape: 'rectangular' });
    mockDeriveColors.mockResolvedValue({ fill: '#2C2C2A', stroke: '#FFFFFF' });

    const result = await resolveOverlayStyle(Buffer.from('fake-png'));

    expect(result.fill).toBe('#2C2C2A');
    expect(result.stroke).toBe('#FFFFFF');
    expect(result.shape).toBe('rectangular');
  });

  it('passes colorPalette and styleTag context through to analyzeArtStyle', async () => {
    mockAnalyze.mockResolvedValue({ fontCategory: 'bold-display', shape: 'rectangular' });
    mockDeriveColors.mockResolvedValue({ fill: '#2C2C2A', stroke: '#FFFFFF' });

    await resolveOverlayStyle(Buffer.from('fake-png'), { colorPalette: 'neon', styleTag: 'cyberpunk' });

    expect(mockAnalyze).toHaveBeenCalledWith(expect.any(Buffer), { colorPalette: 'neon', styleTag: 'cyberpunk' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlayStyling.test.ts`
Expected: FAIL — `analyzeArtStyle` mock target doesn't match the real module's exports yet (still exports `classifyFontCategory`), and `result.shape` is `undefined`.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `apps/frontend/src/lib/textOverlayStyling.ts` with:

```typescript
// apps/frontend/src/lib/textOverlayStyling.ts
import { analyzeArtStyle, type StyleAnalysisContext, type ArtShape } from './artStyleAnalysis';
import { deriveTextColors } from './colorExtraction';
import { loadFontForCategory } from './fontLibrary';

export interface ResolvedOverlayStyle {
  fontBuffer: Buffer;
  fill: string;
  stroke: string;
  shape: ArtShape;
}

export async function resolveOverlayStyle(
  imageBuffer: Buffer,
  context: StyleAnalysisContext = {},
): Promise<ResolvedOverlayStyle> {
  const [style, colors] = await Promise.all([
    analyzeArtStyle(imageBuffer, context),
    deriveTextColors(imageBuffer),
  ]);

  return {
    fontBuffer: loadFontForCategory(style.fontCategory),
    fill: colors.fill,
    stroke: colors.stroke,
    shape: style.shape,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlayStyling.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/textOverlayStyling.ts apps/frontend/src/lib/textOverlayStyling.test.ts
git commit -m "feat: thread detected art shape through overlay style resolver"
```

---

### Task 4: Branch text compositing on shape

**Files:**
- Modify: `apps/frontend/src/lib/textOverlay.ts`
- Modify: `apps/frontend/src/lib/textOverlay.test.ts`

**Interfaces:**
- Consumes: `renderArcedTextToSvg`, `ArcTextTooSmallError` from `./textRender` (Task 2); `type ArtShape` from `./artStyleAnalysis` (Task 1).
- Produces: `applyTextOverlay(artBuffer, phrase, fontBuffer, colors?, shape?: ArtShape)`, `applyTextOverlayWithFallback(artBuffer, phrase, fontBuffer, colors?, shrinkScale?, shape?: ArtShape)` — used by Task 5. Both default `shape` to `'rectangular'`, so existing 4-arg call sites are unaffected.

- [ ] **Step 1: Write the failing tests**

Add these three tests to `apps/frontend/src/lib/textOverlay.test.ts` — the first two inside the existing `describe('applyTextOverlay', ...)` block (after the `'uses the provided fill and stroke colors...'` test), the third inside the existing `describe('applyTextOverlayWithFallback', ...)` block (after its last test):

```typescript
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

    expect(circular.equals(straight)).toBe(false);
  });

  it('returns the original buffer unchanged when circular text cannot fit above the minimum legible arc size', async () => {
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
    expect(output.equals(canvas)).toBe(true);
  });
```

```typescript
  it('falls back to shrink + straight-line rendering (never a second arc attempt) when circular text overflows', async () => {
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

    expect(withFallback.equals(canvas)).toBe(false);
    expect(withFallback.equals(expectedFallbackOutput)).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlay.test.ts`
Expected: FAIL — `applyTextOverlay`/`applyTextOverlayWithFallback` don't accept a `shape` argument yet.

- [ ] **Step 3: Modify the implementation**

In `apps/frontend/src/lib/textOverlay.ts`, change the import line (currently line 2):

```typescript
import { loadFont, renderTextToSvg } from './textRender';
```

to:

```typescript
import { loadFont, renderTextToSvg, renderArcedTextToSvg, ArcTextTooSmallError } from './textRender';
import type { ArtShape } from './artStyleAnalysis';
```

Then replace the `applyTextOverlay` and `applyTextOverlayWithFallback` functions (currently the last two exported functions in the file) with:

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
  shape: ArtShape = 'rectangular',
): Promise<Buffer> {
  const meta = await sharp(artBuffer).metadata();
  const canvasWidth = meta.width ?? 0;
  const canvasHeight = meta.height ?? 0;

  const artBox = await getArtBoundingBox(artBuffer);
  const marginPx = Math.round(Math.min(canvasWidth, canvasHeight) * 0.04);
  const zone = computeTextZone(canvasWidth, canvasHeight, artBox, marginPx);

  if (zone.height <= 0 || zone.width <= 0) return artBuffer;

  const font = loadFont(fontBuffer);
  const renderOptions = {
    maxWidth: zone.width,
    maxHeight: zone.height,
    fill: colors.fill,
    stroke: colors.stroke,
  };

  if (shape === 'circular') {
    try {
      const rendered = renderArcedTextToSvg(font, phrase, renderOptions);
      const textPng = await sharp(rendered.svg).png().toBuffer();
      return compositeTextOverArt(artBuffer, textPng, zone);
    } catch (err) {
      if (!(err instanceof ArcTextTooSmallError)) throw err;
      return artBuffer;
    }
  }

  const rendered = renderTextToSvg(font, phrase, renderOptions);
  const textPng = await sharp(rendered.svg).png().toBuffer();
  return compositeTextOverArt(artBuffer, textPng, zone);
}

// Combines applyTextOverlay with the shrinkArtForTextZone fallback: try the
// natural bounding box first (curved for circular shapes, straight
// otherwise), and only shrink if that left no real room. The shrink retry
// always renders straight-line text -- never a second arc attempt -- so a
// circular asset with an overlong phrase degrades to exactly what it would
// look like today, no new failure mode.
export async function applyTextOverlayWithFallback(
  artBuffer: Buffer,
  phrase: string,
  fontBuffer: Buffer,
  colors: OverlayColors = {},
  shrinkScale = 0.75,
  shape: ArtShape = 'rectangular',
): Promise<Buffer> {
  const output = await applyTextOverlay(artBuffer, phrase, fontBuffer, colors, shape);
  if (!output.equals(artBuffer)) return output;

  const shrunk = await shrinkArtForTextZone(artBuffer, shrinkScale);
  return applyTextOverlay(shrunk, phrase, fontBuffer, colors, 'rectangular');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/lib/textOverlay.test.ts`
Expected: PASS (14/14)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/textOverlay.ts apps/frontend/src/lib/textOverlay.test.ts
git commit -m "feat: render curved top-arc text for circular-shaped art"
```

---

### Task 5: Wire shape into `create-asset/route.ts`

**Files:**
- Modify: `apps/frontend/src/app/api/n8n/create-asset/route.ts`

**Interfaces:**
- Consumes: `resolveOverlayStyle` from `@/lib/textOverlayStyling` (Task 3, already imported), `applyTextOverlayWithFallback` from `@/lib/textOverlay` (Task 4, already imported).

- [ ] **Step 1: Pass the detected shape through the overlay call**

Find this block (currently lines 265-275):

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

Replace with:

```typescript
      if (phrase) {
        try {
          const overlayStyle = await resolveOverlayStyle(png, { colorPalette, styleTag: style });
          png = await applyTextOverlayWithFallback(
            png,
            phrase,
            overlayStyle.fontBuffer,
            { fill: overlayStyle.fill, stroke: overlayStyle.stroke },
            0.75,
            overlayStyle.shape,
          );
        } catch (overlayErr: any) {
          log('create_asset.text_overlay_failed', { requestId, rowId, message: String(overlayErr?.message) });
        }
      }
```

- [ ] **Step 2: Verify the route still type-checks and builds**

Run: `cd apps/frontend && npm run build`
Expected: build succeeds with no new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/api/n8n/create-asset/route.ts
git commit -m "feat: wire detected shape into create-asset text overlay call"
```

---

### Task 6: Update the manual visual-inspection script

**Files:**
- Modify: `apps/frontend/ops/text-overlay-prototype.mjs`

- [ ] **Step 1: Switch the prototype prompt to a circular badge design**

Find (currently lines 20-26):

```javascript
// Doc's original prompt, verbatim — tweaking the wording to "reserve the top
// third" was tried and measured to make no reliable difference (Recraft still
// framed the subject nearly full-bleed). Space for text is instead created
// deterministically below via shrinkArtForTextZone.
const PROMPT = `Anthropic-style vector illustration of an anthropomorphic coffee mug mascot character, teal ceramic mug with a bold cartoon face (wide open mouth, expressive eyes, one arm raised in a triumphant fist pump), fully contained within frame with even margin on all sides, mug sits on a pile of scattered coffee beans, coffee beans floating around the character, dynamic coffee splash swirl in the background upper-left, bold black outlines, flat vibrant color palette (teal, cream, dark brown, soft pink), comic/cartoon sticker style, clean vector linework, high contrast, centered composition, isolated on transparent background, no text, no lettering, no watermark`;

const PHRASE = 'ESPRESSO YOURSELF';
```

Replace with:

```javascript
// Circular badge composition, deliberately chosen (rather than the original
// mug mascot prompt) to exercise the new arc-text path -- GPT-4o vision
// should classify this as shape: 'circular' via analyzeArtStyle.
const PROMPT = `Anthropic-style vector illustration of a circular vintage badge emblem, bold circular ring border, coffee cup icon centered inside the ring, retro patch/badge composition, flat vibrant color palette (teal, cream, dark brown, soft pink), comic/cartoon sticker style, clean vector linework, high contrast, centered composition, isolated on transparent background, no text, no lettering, no watermark`;

const PHRASE = "WORLD'S BEST";
```

- [ ] **Step 2: Print the resolved shape alongside font/color**

Find (currently lines 48-53):

```javascript
  const overlayStyle = await resolveOverlayStyle(artBuffer);
  console.log(`Resolved style: fill=${overlayStyle.fill} stroke=${overlayStyle.stroke}`);
  const output = await applyTextOverlayWithFallback(artBuffer, PHRASE, overlayStyle.fontBuffer, {
    fill: overlayStyle.fill,
    stroke: overlayStyle.stroke,
  });
```

Replace with:

```javascript
  const overlayStyle = await resolveOverlayStyle(artBuffer);
  console.log(`Resolved style: fill=${overlayStyle.fill} stroke=${overlayStyle.stroke} shape=${overlayStyle.shape}`);
  const output = await applyTextOverlayWithFallback(
    artBuffer,
    PHRASE,
    overlayStyle.fontBuffer,
    { fill: overlayStyle.fill, stroke: overlayStyle.stroke },
    0.75,
    overlayStyle.shape,
  );
```

- [ ] **Step 3: Run the script manually against a real generation to eyeball the result**

Run: `cd apps/frontend && node --env-file=.env.local --import tsx ops/text-overlay-prototype.mjs`
Expected: script prints `shape=circular` (confirming GPT-4o vision classified the badge correctly) and writes a PNG; open it via the Read tool to confirm the phrase visually curves along the badge's top rim rather than sitting as a straight banner. If GPT classifies it as `rectangular` instead, that's a prompt-tuning issue with the test fixture, not a code bug — note it and consider adjusting `PROMPT` before re-running, rather than treating it as an implementation failure.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/ops/text-overlay-prototype.mjs
git commit -m "chore: verify curved text rendering against a circular badge prototype"
```

---

## Self-Review Notes

- **Spec coverage:** Detection via extended GPT-4o call (Task 1), binary shape enum (Task 1), arc rendering with fixed-proportion radius (Task 2), always-curve-for-circular + never-retry-arc-on-overflow (Task 4), orchestrator threading (Task 3), route wiring (Task 5), live visual verification (Task 6) — all covered. No sheet/schema changes anywhere in the plan, matching the spec's explicit scope boundary.
- **Type consistency:** `ArtShape` (Task 1) flows unchanged into `ResolvedOverlayStyle` (Task 3), `applyTextOverlay`/`applyTextOverlayWithFallback` (Task 4), and `route.ts` (Task 5) — no renamed duplicates. `RenderTextOptions`/`RenderedText` (existing, `textRender.ts`) are reused as-is by `renderArcedTextToSvg` (Task 2), matching `renderTextToSvg`'s existing signature shape.
- **Breaking rename confirmed safe:** `classifyFontCategory` → `analyzeArtStyle` (Task 1) has exactly two non-test consumers repo-wide (`textOverlayStyling.ts` and its own test file), both updated in Tasks 1 and 3.
- **No new user-facing failure mode:** every new error path (invalid/missing shape from GPT, `ArcTextTooSmallError`) resolves to a behavior that already exists today (`shape: 'rectangular'`, or the pre-existing shrink+straight fallback) — confirmed in Tasks 1 and 4.
