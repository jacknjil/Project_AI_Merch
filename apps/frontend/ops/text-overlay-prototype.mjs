#!/usr/bin/env node
/**
 * Manual visual prototype for the app-side text-overlay pipeline.
 * Generates a fresh "Espresso Yourself" mascot image via Recraft, ensures it
 * has an alpha channel, composites the phrase onto it, and writes the result
 * to disk for visual inspection.
 *
 * Usage: node --env-file=.env.local --import tsx ops/text-overlay-prototype.mjs
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { recraftGenerate, removeBackground } from '../src/lib/recraft.ts';
import { hasAlphaChannel } from '../src/lib/printify.ts';
import { applyTextOverlayWithFallback } from '../src/lib/textOverlay.ts';
import { resolveOverlayStyle } from '../src/lib/textOverlayStyling.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Circular badge composition, deliberately chosen (rather than the original
// mug mascot prompt) to exercise the new arc-text path -- GPT-4o vision
// should classify this as shape: 'circular' via analyzeArtStyle.
const PROMPT = `Anthropic-style vector illustration of a circular vintage badge emblem, bold circular ring border, coffee cup icon centered inside the ring, retro patch/badge composition, flat vibrant color palette (teal, cream, dark brown, soft pink), comic/cartoon sticker style, clean vector linework, high contrast, centered composition, isolated on transparent background, no text, no lettering, no watermark`;

const PHRASE = "WORLD'S BEST";
const OUTPUT_PATH = join(__dirname, 'text-overlay-prototype-output.png');

async function run() {
  console.log('Generating art from Recraft...');
  const result = await recraftGenerate({ prompt: PROMPT, productCategory: 'mug', n: 1, size: '1024x1024' });
  let sourceUrl = result.data?.[0]?.url;
  if (!sourceUrl) throw new Error('Recraft returned no image URL');

  let res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status}`);
  let artBuffer = Buffer.from(await res.arrayBuffer());

  if (!(await hasAlphaChannel(artBuffer))) {
    console.log('No alpha channel detected, removing background...');
    sourceUrl = await removeBackground(sourceUrl);
    res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to fetch background-removed image: ${res.status}`);
    artBuffer = Buffer.from(await res.arrayBuffer());
  }

  console.log('Compositing text overlay...');
  const overlayStyle = await resolveOverlayStyle(artBuffer);
  console.log(`Resolved style: fill=${overlayStyle.fill} stroke=${overlayStyle.stroke} shape=${overlayStyle.shape}`);
  const output = await applyTextOverlayWithFallback(
    artBuffer,
    PHRASE,
    overlayStyle.fontBuffer,
    { fill: overlayStyle.fill, stroke: overlayStyle.stroke },
    0.75,
    overlayStyle.shape,
  );

  writeFileSync(OUTPUT_PATH, output);
  console.log(`Done. Wrote ${OUTPUT_PATH}`);
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
