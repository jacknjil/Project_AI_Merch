import { readFileSync } from 'fs';
import { join } from 'path';
import opentype from 'opentype.js';
import { DEFAULT_CATEGORY, type FontCategory } from './artStyleAnalysis';

const FONT_FILES: Record<FontCategory, string> = {
  'bold-display': 'LuckiestGuy-Regular.ttf',
  'elegant-serif': 'CrimsonText-Bold.ttf',
  'playful-script': 'Pacifico-Regular.ttf',
  'vintage-distressed': 'Rye-Regular.ttf',
  'minimal-sans': 'Poppins-Bold.ttf',
};

const cache = new Map<FontCategory, Buffer>();

function readFontFile(category: FontCategory): Buffer {
  // process.cwd()-relative, not __dirname: under Next.js's per-route webpack
  // bundling, __dirname for a module pulled into an API route resolves to
  // that route's compiled output directory (e.g.
  // .next/server/app/api/n8n/create-asset/), not this file's source
  // location — causing ENOENT in production while working locally under
  // tsx/vitest. process.cwd() stays the app root in both environments, and
  // next.config.js's outputFileTracingIncludes already copies
  // src/lib/fonts/** there for the standalone build.
  return readFileSync(join(process.cwd(), 'src/lib/fonts', FONT_FILES[category]));
}

// Some font files parse fine but ship a GSUB table opentype.js can't read --
// CrimsonText-Bold.ttf throws "substitutionType : 62 lookupType: 6 -
// substFormat: 2 is not yet supported" from getPath() on any 2+ character
// string, regardless of text content or requested features. That silently
// killed the phrase overlay for every asset mapped to 'elegant-serif'
// (confirmed on rowId 60, 322, 323 via prod logs: create_asset.text_overlay_failed).
// Smoke-test shaping once per category so a broken font degrades to the
// known-good default instead of losing the overlay entirely.
function canShapeText(buffer: Buffer): boolean {
  try {
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    opentype.parse(arrayBuffer).getPath('Ag', 0, 72, 72);
    return true;
  } catch {
    return false;
  }
}

export function loadFontForCategory(category: FontCategory): Buffer {
  const cached = cache.get(category);
  if (cached) return cached;

  const buffer = readFontFile(category);
  if (canShapeText(buffer)) {
    cache.set(category, buffer);
    return buffer;
  }

  console.warn(
    `fontLibrary: "${FONT_FILES[category]}" (${category}) failed the text-shaping smoke test; falling back to ${DEFAULT_CATEGORY}`,
  );
  const fallback = readFontFile(DEFAULT_CATEGORY);
  cache.set(category, fallback);
  return fallback;
}
