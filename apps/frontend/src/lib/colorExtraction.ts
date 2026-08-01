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

export function contrastRatio(a: Rgb, b: Rgb): number {
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
