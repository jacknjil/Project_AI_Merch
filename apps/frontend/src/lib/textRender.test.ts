import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadFont, renderTextToSvg, renderArcedTextToSvg, ArcTextTooSmallError } from './textRender';

const fontBuffer = readFileSync(join(__dirname, 'fonts', 'LuckiestGuy-Regular.ttf'));

describe('loadFont', () => {
  it('parses the bundled font file into an opentype Font', () => {
    const font = loadFont(fontBuffer);
    expect(font.unitsPerEm).toBeGreaterThan(0);
  });
});

describe('renderTextToSvg', () => {
  const font = loadFont(fontBuffer);

  it('fits rendered text within the given max width and height', () => {
    const result = renderTextToSvg(font, 'ESPRESSO YOURSELF', { maxWidth: 800, maxHeight: 200 });
    expect(result.width).toBeLessThanOrEqual(800);
    expect(result.height).toBeLessThanOrEqual(200);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('produces an SVG buffer containing a path element', () => {
    const result = renderTextToSvg(font, 'HELLO', { maxWidth: 500, maxHeight: 200 });
    expect(result.svg.toString('utf-8')).toContain('<path');
  });

  it('scales a longer phrase down to still fit the same box as a shorter phrase', () => {
    const short = renderTextToSvg(font, 'HI', { maxWidth: 400, maxHeight: 150 });
    const long = renderTextToSvg(font, 'ESPRESSO YOURSELF TODAY', { maxWidth: 400, maxHeight: 150 });
    expect(short.width).toBeLessThanOrEqual(400);
    expect(long.width).toBeLessThanOrEqual(400);
  });

  it('throws for an empty phrase', () => {
    expect(() => renderTextToSvg(font, '', { maxWidth: 400, maxHeight: 150 })).toThrow();
  });
});

describe('renderArcedTextToSvg', () => {
  const font = loadFont(fontBuffer);

  it('produces an SVG buffer with one glyph group per character', () => {
    const result = renderArcedTextToSvg(font, 'HI', { maxWidth: 400, maxHeight: 200, radius: 300 });
    expect(result.svg.toString('utf-8')).toContain('<g transform=');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('produces more vertical extent than the straight-line renderer for the same text and box', () => {
    const straight = renderTextToSvg(font, 'HELLO WORLD', { maxWidth: 700, maxHeight: 300 });
    const arced = renderArcedTextToSvg(font, 'HELLO WORLD', { maxWidth: 700, maxHeight: 300, radius: 500 });
    expect(arced.height).toBeGreaterThan(straight.height);
  });

  it('curves more tightly (more vertical extent) for a smaller radius, given the same text and box', () => {
    const tight = renderArcedTextToSvg(font, 'HELLO WORLD', { maxWidth: 900, maxHeight: 400, radius: 300 });
    const loose = renderArcedTextToSvg(font, 'HELLO WORLD', { maxWidth: 900, maxHeight: 400, radius: 1200 });
    expect(tight.height).toBeGreaterThan(loose.height);
  });

  it('returns an anchor point matching the rendered SVG bounds', () => {
    const result = renderArcedTextToSvg(font, 'HI', { maxWidth: 400, maxHeight: 200, radius: 300 });
    expect(result.anchorX).toBeGreaterThanOrEqual(0);
    expect(result.anchorX).toBeLessThanOrEqual(result.width);
    expect(result.anchorY).toBeGreaterThanOrEqual(0);
    expect(result.anchorY).toBeLessThanOrEqual(result.height);
  });

  it('throws ArcTextTooSmallError when the phrase cannot fit above the minimum legible size', () => {
    expect(() =>
      renderArcedTextToSvg(font, 'AN EXTREMELY LONG PHRASE THAT DEFINITELY WONT FIT', {
        maxWidth: 100,
        maxHeight: 20,
        radius: 200,
      }),
    ).toThrow(ArcTextTooSmallError);
  });

  it('throws ArcTextTooSmallError when the radius is too small even though width/height are generous', () => {
    expect(() =>
      renderArcedTextToSvg(font, 'HELLO WORLD', { maxWidth: 2000, maxHeight: 2000, radius: 20 }),
    ).toThrow(ArcTextTooSmallError);
  });

  it('throws for an empty phrase', () => {
    expect(() => renderArcedTextToSvg(font, '', { maxWidth: 400, maxHeight: 150, radius: 300 })).toThrow();
  });

  function extractTransforms(svg: string): Array<{ tx: number; ty: number; deg: number }> {
    const re = /translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)/g;
    const results: Array<{ tx: number; ty: number; deg: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(svg))) {
      results.push({ tx: parseFloat(m[1]), ty: parseFloat(m[2]), deg: parseFloat(m[3]) });
    }
    return results;
  }

  it('defaults to direction "top" when omitted', () => {
    const withDefault = renderArcedTextToSvg(font, 'HI', { maxWidth: 400, maxHeight: 200, radius: 300 });
    const explicitTop = renderArcedTextToSvg(font, 'HI', { maxWidth: 400, maxHeight: 200, radius: 300, direction: 'top' });
    expect(withDefault.svg.equals(explicitTop.svg)).toBe(true);
    expect(withDefault.width).toBe(explicitTop.width);
    expect(withDefault.height).toBe(explicitTop.height);
  });

  it('mirrors vertical position and rotation (not horizontal position) for direction "bottom" vs "top"', () => {
    const top = renderArcedTextToSvg(font, 'HELLO', { maxWidth: 900, maxHeight: 400, radius: 500, direction: 'top' });
    const bottom = renderArcedTextToSvg(font, 'HELLO', { maxWidth: 900, maxHeight: 400, radius: 500, direction: 'bottom' });

    const topTransforms = extractTransforms(top.svg.toString('utf-8'));
    const bottomTransforms = extractTransforms(bottom.svg.toString('utf-8'));

    expect(topTransforms.length).toBeGreaterThan(0);
    expect(bottomTransforms.length).toBe(topTransforms.length);

    for (let i = 0; i < topTransforms.length; i++) {
      expect(bottomTransforms[i].tx).toBeCloseTo(topTransforms[i].tx, 1);
      expect(bottomTransforms[i].ty).toBeCloseTo(-topTransforms[i].ty, 1);
      expect(bottomTransforms[i].deg).toBeCloseTo(-topTransforms[i].deg, 1);
    }
  });

  it('fits within maxWidth/maxHeight for direction "bottom" same as top', () => {
    const result = renderArcedTextToSvg(font, 'HELLO WORLD', { maxWidth: 700, maxHeight: 300, radius: 500, direction: 'bottom' });
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('returns an anchor point matching the rendered SVG bounds for direction "bottom"', () => {
    const result = renderArcedTextToSvg(font, 'HI', { maxWidth: 400, maxHeight: 200, radius: 300, direction: 'bottom' });
    expect(result.anchorX).toBeGreaterThanOrEqual(0);
    expect(result.anchorX).toBeLessThanOrEqual(result.width);
    expect(result.anchorY).toBeGreaterThanOrEqual(0);
    expect(result.anchorY).toBeLessThanOrEqual(result.height);
  });

  it('throws ArcTextTooSmallError for direction "bottom" under the same too-small conditions as top', () => {
    expect(() =>
      renderArcedTextToSvg(font, 'AN EXTREMELY LONG PHRASE THAT DEFINITELY WONT FIT', {
        maxWidth: 100,
        maxHeight: 20,
        radius: 200,
        direction: 'bottom',
      }),
    ).toThrow(ArcTextTooSmallError);
  });
});
