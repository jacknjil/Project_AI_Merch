import { readFileSync } from 'fs';
import { join } from 'path';
import type { FontCategory } from './artStyleAnalysis';

const FONT_FILES: Record<FontCategory, string> = {
  'bold-display': 'LuckiestGuy-Regular.ttf',
  'elegant-serif': 'CrimsonText-Bold.ttf',
  'playful-script': 'Pacifico-Regular.ttf',
  'vintage-distressed': 'Rye-Regular.ttf',
  'minimal-sans': 'Poppins-Bold.ttf',
};

const cache = new Map<FontCategory, Buffer>();

export function loadFontForCategory(category: FontCategory): Buffer {
  const cached = cache.get(category);
  if (cached) return cached;

  const buffer = readFileSync(join(__dirname, 'fonts', FONT_FILES[category]));
  cache.set(category, buffer);
  return buffer;
}
