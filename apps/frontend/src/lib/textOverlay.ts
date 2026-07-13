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
