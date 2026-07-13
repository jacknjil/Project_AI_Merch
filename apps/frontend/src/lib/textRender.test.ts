import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadFont, renderTextToSvg } from './textRender';

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
