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

  // Same box-fit contract as renderTextToSvg's scale formula, but curving
  // the glyphs afterward adds vertical sagitta on top of this straight-line
  // height -- the arc's final `height` can exceed maxHeight, and the
  // resulting overlap with the art's top rim is the intended patch-badge
  // look (live-verified), not a bug to fit-check away here.
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
