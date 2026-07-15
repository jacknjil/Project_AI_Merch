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
