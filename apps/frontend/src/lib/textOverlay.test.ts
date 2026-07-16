import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getArtBoundingBox, computeTextZone, compositeTextOverArt, applyTextOverlay, shrinkArtForTextZone, applyTextOverlayWithFallback } from './textOverlay';

const fontBuffer = readFileSync(join(__dirname, 'fonts', 'LuckiestGuy-Regular.ttf'));

describe('getArtBoundingBox', () => {
  it('detects the bounding box of opaque content on a transparent canvas', async () => {
    const opaque = await sharp({
      create: { width: 40, height: 30, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();

    const canvas = await sharp({
      create: { width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: opaque, left: 60, top: 20 }])
      .png()
      .toBuffer();

    const box = await getArtBoundingBox(canvas);
    expect(box).toEqual({ left: 60, top: 20, width: 40, height: 30 });
  });

  it('treats a uniform full-bleed image as filling the entire canvas', async () => {
    const uniform = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const box = await getArtBoundingBox(uniform);
    expect(box).toEqual({ left: 0, top: 0, width: 300, height: 300 });
  });
});

describe('computeTextZone', () => {
  it('reserves the area above the art bounding box, inset by the margin', () => {
    const zone = computeTextZone(1000, 1000, { left: 100, top: 200, width: 800, height: 700 }, 40);
    expect(zone).toEqual({ x: 40, y: 40, width: 920, height: 120 });
  });

  it('returns zero height when the art leaves no room above it', () => {
    const zone = computeTextZone(1000, 1000, { left: 0, top: 10, width: 1000, height: 990 }, 40);
    expect(zone.height).toBe(0);
  });
});

describe('compositeTextOverArt', () => {
  it('places the text buffer centered within the zone, preserving alpha', async () => {
    const art = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();

    const text = await sharp({
      create: { width: 50, height: 20, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png().toBuffer();

    const zone = { x: 0, y: 0, width: 200, height: 80 };
    const output = await compositeTextOverArt(art, text, zone);
    const meta = await sharp(output).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);

    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    const centerX = Math.round(zone.width / 2);
    const centerY = Math.round(zone.height / 2);
    const idx = (centerY * info.width + centerX) * info.channels;
    expect(data[idx + 3]).toBeGreaterThan(0);
  });
});

describe('shrinkArtForTextZone', () => {
  it('shrinks the art and anchors it to the bottom, freeing space above on the same-size canvas', async () => {
    const art = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const output = await shrinkArtForTextZone(art, 0.75);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
    expect(meta.hasAlpha).toBe(true);

    const box = await getArtBoundingBox(output);
    expect(box.top).toBe(100);
    expect(box.height).toBe(300);
  });
});

describe('applyTextOverlay', () => {
  it('composites text above the art and preserves canvas dimensions', async () => {
    const opaqueArt = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const canvas = await sharp({
      create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: opaqueArt, left: 150, top: 400 }])
      .png()
      .toBuffer();

    const output = await applyTextOverlay(canvas, 'ESPRESSO YOURSELF', fontBuffer);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(800);
    expect(meta.hasAlpha).toBe(true);
    expect(output.equals(canvas)).toBe(false);
  });

  it('returns the original buffer unchanged when there is no room for text', async () => {
    const canvas = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const output = await applyTextOverlay(canvas, 'ESPRESSO YOURSELF', fontBuffer);
    expect(output.equals(canvas)).toBe(true);
  });

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
});

describe('applyTextOverlayWithFallback', () => {
  it('shrinks and retries when the natural bounding box leaves no room for text', async () => {
    const uniform = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const output = await applyTextOverlayWithFallback(uniform, 'ESPRESSO YOURSELF', fontBuffer);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
    expect(output.equals(uniform)).toBe(false);
  });

  it('uses the natural bounding box directly when there is already room', async () => {
    const opaqueArt = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const canvas = await sharp({
      create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: opaqueArt, left: 150, top: 400 }])
      .png()
      .toBuffer();

    const withFallback = await applyTextOverlayWithFallback(canvas, 'ESPRESSO YOURSELF', fontBuffer);
    const direct = await applyTextOverlay(canvas, 'ESPRESSO YOURSELF', fontBuffer);
    expect(withFallback.equals(direct)).toBe(true);
  });

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

  it('shrinks then successfully renders arced text on the shrunk art when the natural zone does not exist', async () => {
    const uniform = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const withFallback = await applyTextOverlayWithFallback(uniform, 'HI', fontBuffer, {}, 0.75, 'circular');

    const shrunk = await shrinkArtForTextZone(uniform, 0.75);
    const straightOnShrunk = await applyTextOverlay(shrunk, 'HI', fontBuffer, {}, 'rectangular');

    expect(withFallback.equals(uniform)).toBe(false);
    expect(withFallback.equals(straightOnShrunk)).toBe(false);
  });
});
