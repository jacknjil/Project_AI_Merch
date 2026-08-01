import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { deriveTextColors, CURATED_PALETTE, rgbToHueSaturation, circularHueDistance, extractOpaquePixels, topClusters } from './colorExtraction';

async function solidCanvas(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 200, channels: 4, background: { r, g, b, alpha: 1 } },
  }).png().toBuffer();
}

describe('deriveTextColors', () => {
  it('picks a white fill with black stroke for a dark image', async () => {
    const canvas = await solidCanvas(0, 0, 0);
    const result = await deriveTextColors(canvas);
    expect(result).toEqual({ fill: '#FFFFFF', stroke: '#000000' });
  });

  it('picks a black fill with white stroke for a light image', async () => {
    const canvas = await solidCanvas(255, 255, 255);
    const result = await deriveTextColors(canvas);
    expect(result).toEqual({ fill: '#000000', stroke: '#FFFFFF' });
  });

  it('falls back to the default pair when extraction fails', async () => {
    const invalidBuffer = Buffer.from('not a real image');
    const result = await deriveTextColors(invalidBuffer);
    expect(result).toEqual({ fill: '#2C2C2A', stroke: '#FFFFFF' });
  });
});

describe('CURATED_PALETTE', () => {
  it('contains exactly the 10 spec-defined tones', () => {
    const names = CURATED_PALETTE.map((c) => c.name).sort();
    expect(names).toEqual(
      ['Burgundy', 'Charcoal', 'Cream', 'Espresso', 'Forest', 'Mustard', 'Navy', 'Slate', 'Stone', 'Terracotta'].sort(),
    );
  });

  it('every entry has an rgb value consistent with its hex', () => {
    for (const color of CURATED_PALETTE) {
      const hex = color.hex.slice(1);
      expect(color.rgb.r).toBe(parseInt(hex.slice(0, 2), 16));
      expect(color.rgb.g).toBe(parseInt(hex.slice(2, 4), 16));
      expect(color.rgb.b).toBe(parseInt(hex.slice(4, 6), 16));
    }
  });
});

describe('rgbToHueSaturation', () => {
  it('returns zero saturation for pure gray/black/white', () => {
    expect(rgbToHueSaturation({ r: 0, g: 0, b: 0 }).saturation).toBe(0);
    expect(rgbToHueSaturation({ r: 255, g: 255, b: 255 }).saturation).toBe(0);
    expect(rgbToHueSaturation({ r: 128, g: 128, b: 128 }).saturation).toBe(0);
  });

  it('identifies pure red as hue 0', () => {
    const { hue, saturation } = rgbToHueSaturation({ r: 255, g: 0, b: 0 });
    expect(hue).toBe(0);
    expect(saturation).toBeGreaterThan(0);
  });

  it('identifies pure blue as hue 240', () => {
    const { hue } = rgbToHueSaturation({ r: 0, g: 0, b: 255 });
    expect(hue).toBeCloseTo(240, 0);
  });
});

describe('circularHueDistance', () => {
  it('returns 0 for identical hues', () => {
    expect(circularHueDistance(30, 30)).toBe(0);
  });

  it('wraps around correctly across the 0/360 boundary', () => {
    expect(circularHueDistance(10, 350)).toBe(20);
  });

  it('returns the max possible distance (180) for opposite hues', () => {
    expect(circularHueDistance(0, 180)).toBe(180);
  });
});

async function solidCanvasWithAlpha(r: number, g: number, b: number, alpha: number): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 200, channels: 4, background: { r, g, b, alpha } },
  }).png().toBuffer();
}

describe('extractOpaquePixels', () => {
  it('returns only opaque pixels, ignoring a fully transparent canvas', async () => {
    const canvas = await solidCanvasWithAlpha(159, 141, 116, 0);
    const pixels = await extractOpaquePixels(canvas);
    expect(pixels.length).toBe(0);
  });

  it('returns pixels matching a fully opaque solid canvas', async () => {
    const canvas = await solidCanvasWithAlpha(159, 141, 116, 1);
    const pixels = await extractOpaquePixels(canvas);
    expect(pixels.length).toBeGreaterThan(0);
    expect(pixels[0]).toEqual([159, 141, 116]);
  });
});

describe('topClusters', () => {
  it('throws when given an empty pixel array', () => {
    expect(() => topClusters([])).toThrow();
  });

  it('returns the single color for a uniform pixel set', () => {
    const pixels: [number, number, number][] = Array.from({ length: 500 }, () => [159, 141, 116]);
    const clusters = topClusters(pixels);
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0][0]).toBeGreaterThan(140);
  });

  it('returns the most populous cluster first for a two-toned pixel set', () => {
    const pixels: [number, number, number][] = [
      ...Array.from({ length: 700 }, () => [20, 20, 20] as [number, number, number]),
      ...Array.from({ length: 100 }, () => [230, 230, 230] as [number, number, number]),
    ];
    const clusters = topClusters(pixels);
    // The dark cluster has 7x the population -- it must be first.
    expect(clusters[0][0]).toBeLessThan(60);
  });
});
