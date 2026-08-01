import { describe, it, expect } from 'vitest';
import opentype from 'opentype.js';
import { loadFontForCategory } from './fontLibrary';
import { FONT_CATEGORIES } from './artStyleAnalysis';

describe('loadFontForCategory', () => {
  it.each(FONT_CATEGORIES)('loads a font for category "%s" that can shape multi-character text', (category) => {
    const buffer = loadFontForCategory(category);
    expect(buffer.length).toBeGreaterThan(0);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const font = opentype.parse(arrayBuffer);
    // Regression guard: CrimsonText-Bold.ttf (elegant-serif) parses fine but
    // throws "substitutionType : 62 lookupType: 6 - substFormat: 2 is not yet
    // supported" from getPath() on any 2+ character string, because opentype.js
    // can't read its GSUB table. Parsing alone (the old assertion here) never
    // caught this -- only actually shaping text does.
    expect(() => font.getPath('Toadally enchanted', 0, 200, 200)).not.toThrow();
  });
});
