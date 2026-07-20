import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getArtBoundingBox, computeTextZone, computeBottomTextZone, compositeTextOverArt, applyTextOverlay, shrinkArtForTextZone, applyTextOverlayWithFallback } from './textOverlay';

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

describe('computeBottomTextZone', () => {
  it('reserves the area below the art bounding box, inset by the margin', () => {
    const zone = computeBottomTextZone(1000, 1000, { left: 100, top: 200, width: 800, height: 500 }, 40);
    // art bottom = 200 + 500 = 700; below-space = 1000 - 700 = 300, minus 2x margin
    expect(zone).toEqual({ x: 40, y: 740, width: 920, height: 220 });
  });

  it('returns zero height when the art leaves no room below it', () => {
    const zone = computeBottomTextZone(1000, 1000, { left: 0, top: 10, width: 1000, height: 980 }, 40);
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

  // Regression test for a real production bug (2026-07-20, row 308): the
  // secondary phrase rendered but was cut off mid-word. Root cause traced to
  // this function only clamping the *lower* bound of the composite position
  // (Math.max(0, ...)) -- if a rendered overlay is ever even slightly wider
  // than the zone it was fit against, the centering math can push
  // `left + textWidth` past the canvas edge, where sharp's composite()
  // silently crops the overflow instead of erroring. Confirmed via a direct
  // test of sharp's own composite behavior: an overlay positioned past the
  // base image's bounds is cropped with no warning. This test proves the
  // fix by putting a distinct marker color on the overlay's trailing edge and
  // confirming it survives compositing instead of being clipped off-canvas.
  it('clamps the composite position so an overlay wider than its zone never gets silently edge-clipped', async () => {
    const overlayWidth = 180;
    const overlayHeight = 40;
    const markerWidth = 5;

    const overlay = await sharp({
      create: { width: overlayWidth, height: overlayHeight, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .composite([{
        input: await sharp({
          create: { width: markerWidth, height: overlayHeight, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
        }).png().toBuffer(),
        left: overlayWidth - markerWidth,
        top: 0,
      }])
      .png()
      .toBuffer();

    const canvas = await sharp({
      create: { width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();

    // Zone is positioned such that naive centering would place the overlay's
    // right edge well past the 200px canvas width (100 + (50-180)/2 = 35;
    // 35 + 180 = 215 > 200).
    const zone = { x: 100, y: 0, width: 50, height: 50 };
    const output = await compositeTextOverArt(canvas, overlay, zone);

    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    let foundMarker = false;
    for (let i = 0; i < info.width * info.height; i++) {
      const idx = i * info.channels;
      if (data[idx] < 20 && data[idx + 1] < 20 && data[idx + 2] > 200 && data[idx + 3] > 200) {
        foundMarker = true;
        break;
      }
    }
    expect(foundMarker).toBe(true);
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

  it('defaults to bottom anchoring when anchor is omitted', async () => {
    const art = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const withoutAnchor = await shrinkArtForTextZone(art, 0.75);
    const withBottomAnchor = await shrinkArtForTextZone(art, 0.75, 'bottom');
    expect(withoutAnchor.equals(withBottomAnchor)).toBe(true);
  });

  it('centers the art vertically instead of anchoring to the bottom when anchor is "center", freeing space on both sides', async () => {
    const art = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
    }).png().toBuffer();

    const output = await shrinkArtForTextZone(art, 0.75, 'center');
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);

    const box = await getArtBoundingBox(output);
    expect(box.height).toBe(300);
    // 400 - 300 = 100px freed total; centered means ~50 above, ~50 below,
    // not all 100 above like the bottom-anchored case.
    expect(box.top).toBe(50);
    const roomBelow = meta.height! - (box.top + box.height);
    expect(roomBelow).toBe(50);
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

  describe('secondaryPhrase', () => {
    // Room above AND below the art's bounding box, unlike the tighter
    // fixtures above which only ever needed room above it.
    async function canvasWithRoomOnBothSides() {
      const opaqueArt = await sharp({
        create: { width: 700, height: 500, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
      }).png().toBuffer();

      return sharp({
        create: { width: 1000, height: 1000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: opaqueArt, left: 150, top: 150 }])
        .png()
        .toBuffer();
    }

    it('omitting secondaryPhrase produces identical output to today (regression guard)', async () => {
      const canvas = await canvasWithRoomOnBothSides();
      const withoutArg = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular');
      const withUndefined = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular', undefined);
      expect(withoutArg.equals(withUndefined)).toBe(true);
    });

    it('composites a visibly different result when a fitting secondaryPhrase is provided, for a circular shape', async () => {
      const canvas = await canvasWithRoomOnBothSides();
      const primaryOnly = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular');
      const withSecondary = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular', 'BYE');
      expect(withSecondary.equals(primaryOnly)).toBe(false);
      expect(withSecondary.equals(canvas)).toBe(false);
    });

    it('composites a visibly different result when a fitting secondaryPhrase is provided, for a rectangular shape', async () => {
      const canvas = await canvasWithRoomOnBothSides();
      const primaryOnly = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular');
      const withSecondary = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular', 'BYE');
      expect(withSecondary.equals(primaryOnly)).toBe(false);
      expect(withSecondary.equals(canvas)).toBe(false);
    });

    it('omitting secondaryPhrase produces identical output to today for a rectangular shape (regression guard)', async () => {
      const canvas = await canvasWithRoomOnBothSides();
      const withoutArg = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular');
      const withUndefined = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular', undefined);
      expect(withoutArg.equals(withUndefined)).toBe(true);
    });

    it('renders primary only, without throwing, when there is no room below the art for a rectangular secondary phrase', async () => {
      const opaqueArt = await sharp({
        create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
      }).png().toBuffer();

      const canvas = await sharp({
        create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: opaqueArt, left: 150, top: 470 }])
        .png()
        .toBuffer();

      const primaryOnly = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular');
      const withSecondary = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'rectangular', 'BYE');
      expect(withSecondary.equals(primaryOnly)).toBe(true);
    });

    it('falls back to primary-only output when secondaryPhrase cannot fit, without throwing', async () => {
      const opaqueArt = await sharp({
        create: { width: 300, height: 300, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 1 } },
      }).png().toBuffer();

      const canvas = await sharp({
        create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: opaqueArt, left: 150, top: 400 }])
        .png()
        .toBuffer();

      const longSecondary = 'THIS SECONDARY PHRASE IS DEFINITELY WAY TOO LONG TO CURVE LEGIBLY IN THIS TINY SPACE';
      const primaryOnly = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular');
      const withUnfittingSecondary = await applyTextOverlay(canvas, 'HI', fontBuffer, {}, 'circular', longSecondary);
      expect(withUnfittingSecondary.equals(primaryOnly)).toBe(true);
    });

    // Regression test for a real production bug (2026-07-19, row 146): on a
    // near-full-bleed circular badge (the common case for Recraft), the old
    // bottom-anchored shrink fallback left ~zero room below the art, so the
    // secondary phrase either got composited overlapping the artwork (first
    // bug, fixed by computeBottomTextZone) or correctly detected no room and
    // silently dropped (second finding) -- neither produces a visible
    // tagline. The real fix is shrinkArtForTextZone's 'center' anchor mode
    // (used automatically whenever a secondaryPhrase is given), which splits
    // the freed space between top and bottom instead of giving it all to the
    // top. Confirmed via a live render that both phrases end up legible and
    // correctly oriented, not just "some buffer difference exists".
    it('actually renders a visible secondary phrase on a near-full-bleed circular badge, by centering the shrunk art instead of anchoring it to the bottom', async () => {
      const canvasSize = 1024;
      const artDiameter = Math.round(canvasSize * 0.96);
      const artOffset = Math.round((canvasSize - artDiameter) / 2);

      const circleSvg = `<svg width="${artDiameter}" height="${artDiameter}"><circle cx="${artDiameter / 2}" cy="${artDiameter / 2}" r="${artDiameter / 2}" fill="rgb(120,80,40)"/></svg>`;
      const circleArt = await sharp(Buffer.from(circleSvg)).png().toBuffer();

      const canvas = await sharp({
        create: { width: canvasSize, height: canvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: circleArt, left: artOffset, top: artOffset }])
        .png()
        .toBuffer();

      const primaryOnly = await applyTextOverlayWithFallback(canvas, 'WANDERLUST', fontBuffer, {}, 0.75, 'circular');
      const withSecondary = await applyTextOverlayWithFallback(
        canvas,
        'WANDERLUST',
        fontBuffer,
        {},
        0.75,
        'circular',
        'ADVENTURE AWAITS',
      );

      // Different from both the untouched canvas and the primary-only
      // render -- something new was actually composited, not silently
      // dropped.
      expect(withSecondary.equals(canvas)).toBe(false);
      expect(withSecondary.equals(primaryOnly)).toBe(false);

      // The centered shrink itself leaves genuine, roughly symmetric room on
      // both sides (not ~0 below, which was the root cause of the bug).
      const centeredArt = await shrinkArtForTextZone(canvas, 0.75, 'center');
      const artBox = await getArtBoundingBox(centeredArt);
      const roomAbove = artBox.top;
      const roomBelow = canvasSize - (artBox.top + artBox.height);
      expect(roomBelow).toBeGreaterThan(50);
      expect(roomBelow).toBeCloseTo(roomAbove, -1);
    });
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
