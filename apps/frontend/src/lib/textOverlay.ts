import sharp from 'sharp';
import { loadFont, renderTextToSvg, renderArcedTextToSvg, ArcTextTooSmallError } from './textRender';
import type { ArtShape } from './artStyleAnalysis';

// How much looser the arc rides versus the badge's exact measured rim --
// 1 means flush against the rim, > 1 rides outside it.
const ARC_RADIUS_SLACK = 1.15;

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

// Mirror of computeTextZone for the area BELOW the art's bounding box --
// needed separately because it is not generally the same size as the zone
// above (e.g. after shrinkArtForTextZone anchors the art flush to the
// canvas bottom, the below-zone collapses to ~0 while the above-zone is
// generous). Reusing computeTextZone's result for both would size/position
// bottom-arc text against the wrong budget.
export function computeBottomTextZone(
  canvasWidth: number,
  canvasHeight: number,
  artBox: BoundingBox,
  marginPx: number,
): TextZone {
  const artBottom = artBox.top + artBox.height;
  const availableHeight = Math.max(canvasHeight - artBottom - marginPx * 2, 0);
  return {
    x: marginPx,
    y: artBottom + marginPx,
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

// Places arced text so the circle it was curved around (the `radius` passed
// into renderArcedTextToSvg) lines up with the real badge instead of just
// centering the text block in a bounding zone: `target` is the badge's true
// apex point in canvas coordinates, `localAnchor` is the pixel offset within
// textPngBuffer that corresponds to that same apex in the arc's own local
// coordinate space (renderArcedTextToSvg's anchorX/anchorY).
export async function compositeArcedTextOverArt(
  artBuffer: Buffer,
  textPngBuffer: Buffer,
  target: { x: number; y: number },
  localAnchor: { x: number; y: number },
): Promise<Buffer> {
  const left = Math.max(0, Math.round(target.x - localAnchor.x));
  const top = Math.max(0, Math.round(target.y - localAnchor.y));

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
export async function shrinkArtForTextZone(
  artBuffer: Buffer,
  scale: number,
  anchor: 'bottom' | 'center' = 'bottom',
): Promise<Buffer> {
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
  // 'bottom' maximizes room above for a single top phrase (the original,
  // single-phrase use case). 'center' splits the freed space between top
  // and bottom instead, needed when a secondary (bottom-arc) phrase also
  // needs real room -- anchoring flush to the bottom would leave it none.
  const top = anchor === 'center' ? Math.round((canvasHeight - resizedHeight) / 2) : canvasHeight - resizedHeight;

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
  secondaryPhrase?: string,
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
    // Radius comes from the art's own trimmed bounding box, not the
    // available zone -- for a circular badge that box tightly wraps the
    // circle, so this is the badge's real rim, not an arbitrary curve.
    // ARC_RADIUS_SLACK is a deliberate stylistic loosening applied on top
    // of that true rim measurement (not baked into it), so the arc rides
    // slightly outside the badge instead of sitting flush against it.
    const badgeRadius = ((artBox.width + artBox.height) / 4) * ARC_RADIUS_SLACK;
    const badgeCenterX = artBox.left + artBox.width / 2;

    let withPrimary: Buffer;
    try {
      const rendered = renderArcedTextToSvg(font, phrase, { ...renderOptions, radius: badgeRadius });
      const textPng = await sharp(rendered.svg).png().toBuffer();
      withPrimary = await compositeArcedTextOverArt(
        artBuffer,
        textPng,
        { x: badgeCenterX, y: artBox.top },
        { x: rendered.anchorX, y: rendered.anchorY },
      );
    } catch (err) {
      if (!(err instanceof ArcTextTooSmallError)) throw err;
      withPrimary = artBuffer;
    }

    if (!secondaryPhrase) return withPrimary;

    // Independent try/catch: the tagline not fitting shouldn't cancel a
    // title that did fit, and vice versa -- each arc succeeds or falls back
    // on its own.
    try {
      // Must use the zone BELOW the art, not `renderOptions` (which holds
      // the zone above it) -- see computeBottomTextZone.
      const bottomZone = computeBottomTextZone(canvasWidth, canvasHeight, artBox, marginPx);
      const renderedSecondary = renderArcedTextToSvg(font, secondaryPhrase, {
        maxWidth: bottomZone.width,
        maxHeight: bottomZone.height,
        fill: colors.fill,
        stroke: colors.stroke,
        radius: badgeRadius,
        direction: 'bottom',
      });
      const secondaryPng = await sharp(renderedSecondary.svg).png().toBuffer();
      return await compositeArcedTextOverArt(
        withPrimary,
        secondaryPng,
        { x: badgeCenterX, y: artBox.top + artBox.height },
        { x: renderedSecondary.anchorX, y: renderedSecondary.anchorY },
      );
    } catch (err) {
      if (!(err instanceof ArcTextTooSmallError)) throw err;
      return withPrimary;
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
  secondaryPhrase?: string,
): Promise<Buffer> {
  const output = await applyTextOverlay(artBuffer, phrase, fontBuffer, colors, shape, secondaryPhrase);
  if (!output.equals(artBuffer)) return output;

  // Only give up bottom-anchoring's larger top margin when there's actually
  // a secondary phrase that needs room of its own -- single-phrase designs
  // keep the original (more generous, well-tested) bottom-anchored shrink.
  const shrunk = await shrinkArtForTextZone(artBuffer, shrinkScale, secondaryPhrase ? 'center' : 'bottom');

  if (shape === 'circular') {
    const shrunkArced = await applyTextOverlay(shrunk, phrase, fontBuffer, colors, 'circular', secondaryPhrase);
    if (!shrunkArced.equals(shrunk)) return shrunkArced;
  }

  return applyTextOverlay(shrunk, phrase, fontBuffer, colors, 'rectangular', secondaryPhrase);
}
