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
