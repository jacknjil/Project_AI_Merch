import sharp from 'sharp';
import { loadFont, renderTextToSvg, renderArcedTextToSvg, ArcTextTooSmallError } from './textRender';
import type { ArtShape } from './artStyleAnalysis';

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

// Experimental: Recraft frames its subject nearly full-bleed regardless of
// prompt wording (measured ~4% top clearance on real generations, well under
// the safe-zone threshold), so there's often no natural room for text within
// the art's own canvas. This creates room deterministically by shrinking the
// art and anchoring it to the bottom of the same-size canvas, instead of
// relying on Recraft to leave space. Revisit if shrinking noticeably hurts
// the art's visual impact.
export async function shrinkArtForTextZone(artBuffer: Buffer, scale: number): Promise<Buffer> {
  const meta = await sharp(artBuffer).metadata();
  const canvasWidth = meta.width ?? 0;
  const canvasHeight = meta.height ?? 0;

  const scaledWidth = Math.max(1, Math.round(canvasWidth * scale));
  const scaledHeight = Math.max(1, Math.round(canvasHeight * scale));

  const resized = await sharp(artBuffer)
    .resize(scaledWidth, scaledHeight, { fit: 'inside' })
    .png()
    .toBuffer();
  const resizedMeta = await sharp(resized).metadata();
  const resizedWidth = resizedMeta.width ?? scaledWidth;
  const resizedHeight = resizedMeta.height ?? scaledHeight;

  const left = Math.round((canvasWidth - resizedWidth) / 2);
  const top = canvasHeight - resizedHeight;

  return sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}

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

// Combines applyTextOverlay with the shrinkArtForTextZone fallback. For
// circular shapes, Recraft's near-full-bleed generation habit means a
// natural zone rarely exists, so the shrink step happens unconditionally
// and the arc is retried on the shrunk art -- only falling through to
// straight-line text if the arc still doesn't fit even then. Rectangular
// shapes are completely unaffected: unchanged natural-zone-then-shrink
// behavior, identical to before this feature existed.
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

  if (shape === 'circular') {
    const shrunkArced = await applyTextOverlay(shrunk, phrase, fontBuffer, colors, 'circular');
    if (!shrunkArced.equals(shrunk)) return shrunkArced;
  }

  return applyTextOverlay(shrunk, phrase, fontBuffer, colors, 'rectangular');
}
