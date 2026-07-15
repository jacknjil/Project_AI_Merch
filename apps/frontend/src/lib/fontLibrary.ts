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

  // process.cwd()-relative, not __dirname: under Next.js's per-route webpack
  // bundling, __dirname for a module pulled into an API route resolves to
  // that route's compiled output directory (e.g.
  // .next/server/app/api/n8n/create-asset/), not this file's source
  // location — causing ENOENT in production while working locally under
  // tsx/vitest. process.cwd() stays the app root in both environments, and
  // next.config.js's outputFileTracingIncludes already copies
  // src/lib/fonts/** there for the standalone build.
  const buffer = readFileSync(join(process.cwd(), 'src/lib/fonts', FONT_FILES[category]));
  cache.set(category, buffer);
  return buffer;
}
