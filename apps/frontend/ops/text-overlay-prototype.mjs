#!/usr/bin/env node
/**
 * Manual visual prototype for the app-side text-overlay pipeline.
 * Generates a fresh "Espresso Yourself" mascot image via Recraft, ensures it
 * has an alpha channel, composites the phrase onto it, and writes the result
 * to disk for visual inspection.
 *
 * Usage: node --env-file=.env.local --import tsx ops/text-overlay-prototype.mjs
 */
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { recraftGenerate, removeBackground } from '../src/lib/recraft.ts';
import { hasAlphaChannel } from '../src/lib/printify.ts';
import { applyTextOverlayWithFallback } from '../src/lib/textOverlay.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Doc's original prompt, verbatim — tweaking the wording to "reserve the top
// third" was tried and measured to make no reliable difference (Recraft still
// framed the subject nearly full-bleed). Space for text is instead created
// deterministically below via shrinkArtForTextZone.
const PROMPT = `Anthropic-style vector illustration of an anthropomorphic coffee mug mascot character, teal ceramic mug with a bold cartoon face (wide open mouth, expressive eyes, one arm raised in a triumphant fist pump), fully contained within frame with even margin on all sides, mug sits on a pile of scattered coffee beans, coffee beans floating around the character, dynamic coffee splash swirl in the background upper-left, bold black outlines, flat vibrant color palette (teal, cream, dark brown, soft pink), comic/cartoon sticker style, clean vector linework, high contrast, centered composition, isolated on transparent background, no text, no lettering, no watermark`;

const PHRASE = 'ESPRESSO YOURSELF';
const OUTPUT_PATH = join(__dirname, 'text-overlay-prototype-output.png');
const FONT_PATH = join(__dirname, '..', 'src', 'lib', 'fonts', 'LuckiestGuy-Regular.ttf');

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
  const fontBuffer = readFileSync(FONT_PATH);
  const output = await applyTextOverlayWithFallback(artBuffer, PHRASE, fontBuffer);

  writeFileSync(OUTPUT_PATH, output);
  console.log(`Done. Wrote ${OUTPUT_PATH}`);
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
