import { describe, it, expect } from 'vitest';
import opentype from 'opentype.js';
import { loadFontForCategory } from './fontLibrary';
import { FONT_CATEGORIES } from './artStyleAnalysis';

describe('loadFontForCategory', () => {
  it.each(FONT_CATEGORIES)('loads a valid, parseable font for category "%s"', (category) => {
    const buffer = loadFontForCategory(category);
    expect(buffer.length).toBeGreaterThan(0);
    expect(() => opentype.parse(buffer)).not.toThrow();
  });
});
