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

  // Floored to a whole pixel: some decorative fonts' glyph outlines have
  // near-degenerate control points (e.g. the fine "crack" details in
  // vintage-distressed faces) that self-intersect and fill solid at one
  // exact fractional font size while rendering correctly a fraction of a
  // pixel to either side -- live-reproduced with Rye-Regular's "e" at
  // 183.0819085931389px collapsing into a blob, fixed at 183px. Floor (not
  // round) so the fit-box guarantee below still holds -- rounding up can
  // push the final measured size a few px past maxWidth/maxHeight.
  const scale = Math.min(maxWidth / ref.width, maxHeight / ref.height);
  const fontSize = Math.floor(REFERENCE_SIZE * scale);
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

export class ArcTextTooSmallError extends Error {}

const MIN_ARC_FONT_SIZE = 32;
// A "cap" arc over the top of the badge, not a full wraparound -- caps how
// far text is allowed to travel around the circle regardless of how large
// maxWidth/maxHeight are.
const MAX_ARC_ANGLE = (150 * Math.PI) / 180;

export interface RenderArcedTextOptions extends RenderTextOptions {
  // The real circle the text should curve around -- pass the art's own
  // bounding-circle radius (see applyTextOverlay in textOverlay.ts) so the
  // text visually hugs the badge's actual rim, not an arbitrary curve.
  radius: number;
}

export interface ArcedRenderedText extends RenderedText {
  // Pixel offset from the SVG's top-left corner to the circle's true apex
  // (the arc's local origin) -- lets the caller line this point up with the
  // badge's own apex in canvas coordinates instead of just centering the
  // whole SVG in a bounding zone.
  anchorX: number;
  anchorY: number;
}

// Curves opentype.js glyph outlines along a top arc. There is no native SVG
// <text>/<textPath> here (glyphs are raw path outlines, same as
// renderTextToSvg), so each character is measured, positioned at an angle
// proportional to its cumulative advance width, and rotated to sit tangent
// to the arc -- the standard manual circular-text-layout technique.
export function renderArcedTextToSvg(font: opentype.Font, text: string, options: RenderArcedTextOptions): ArcedRenderedText {
  const { maxWidth, maxHeight, fill = '#2C2C2A', stroke = '#FFFFFF', strokeWidth = 4, radius } = options;
  const REFERENCE_SIZE = 200;

  const chars = Array.from(text);
  const ref = measureAtSize(font, text, REFERENCE_SIZE);
  const refAdvance = chars.reduce((sum, ch) => sum + font.getAdvanceWidth(ch, REFERENCE_SIZE), 0);
  if (ref.width <= 0 || ref.height <= 0 || refAdvance <= 0) {
    throw new Error(`Cannot render empty or zero-width text: "${text}"`);
  }

  // Advance width and glyph-path bbox height both scale exactly linearly
  // with font size for a fixed string (opentype.js scales every path
  // coordinate by fontSize/unitsPerEm), so a candidate size's fit against
  // the *given, fixed* radius can be checked directly with trig instead of
  // re-measuring the font at every candidate size. Unlike the old
  // maxWidth-derived radius, `radius` here is fixed externally (the badge's
  // real rim), so fontSize has to be solved for against it -- chordWidth and
  // vertical extent both grow with fontSize, so the largest fitting integer
  // size is found by bisection. This also naturally lands on an integer
  // fontSize, sidestepping the fractional-fontSize self-intersecting-glyph
  // landmine fixed in renderTextToSvg above.
  const advancePerPixel = refAdvance / REFERENCE_SIZE;
  const heightPerPixel = ref.height / REFERENCE_SIZE;

  function fitsAtSize(size: number): boolean {
    const totalAdvance = advancePerPixel * size;
    const angle = totalAdvance / radius;
    if (angle > MAX_ARC_ANGLE) return false;
    const chordWidth = 2 * radius * Math.sin(angle / 2);
    const sagitta = radius * (1 - Math.cos(angle / 2));
    const verticalExtent = sagitta + heightPerPixel * size;
    return chordWidth <= maxWidth && verticalExtent <= maxHeight;
  }

  let lo = 0;
  let hi = Math.max(4000, maxWidth * 10, maxHeight * 10);
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fitsAtSize(mid)) lo = mid;
    else hi = mid;
  }
  const fontSize = lo;

  if (fontSize < MIN_ARC_FONT_SIZE) {
    throw new ArcTextTooSmallError(
      `Arced text would render below the minimum legible size (${MIN_ARC_FONT_SIZE}px) for "${text}"`,
    );
  }

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
  // Local origin (0,0) is the circle's apex (see tx/ty above); its position
  // within the rendered raster is just the negated viewBox offset.
  const anchorX = -minX;
  const anchorY = -minY;

  const svg =
    `<svg width="${width}" height="${height}" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${(maxX - minX).toFixed(2)} ${(maxY - minY).toFixed(2)}" xmlns="http://www.w3.org/2000/svg">` +
    glyphGroups.join('') +
    `</svg>`;

  return { svg: Buffer.from(svg), width, height, anchorX, anchorY };
}
