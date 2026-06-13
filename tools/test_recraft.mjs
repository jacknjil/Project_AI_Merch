#!/usr/bin/env node
// Recraft API test — compares V4.1 (no style) vs V3 (style+substyle)
// Usage: node tools/test_recraft.mjs
// Reads RECRAFT_API_KEY from apps/frontend/.env.local

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, '../apps/frontend/.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const API_KEY = env.RECRAFT_API_KEY;
if (!API_KEY) { console.error('ERROR: RECRAFT_API_KEY not found'); process.exit(1); }

// V3 substyle map (separate style + substyle params)
const V3_STYLE_MAP = {
  'vintage-badge':    { style: 'digital_illustration', substyle: 'retro_pop' },
  'watercolor':       { style: 'digital_illustration', substyle: 'hand_drawn' },
  'flat-vector':      { style: 'vector_illustration',  substyle: 'bold_stroke' },
  'typography-humor': { style: 'digital_illustration', substyle: 'hard_comics' },
  'kawaii':           { style: 'digital_illustration', substyle: 'child_book' },
  'cartoon-humor':    { style: 'digital_illustration', substyle: 'hard_comics' },
};

// V4.1 — no style param, style intent injected into prompt
const V4_PROMPT_PREFIX = {
  'vintage-badge':    'vintage retro badge style, poster art, ',
  'watercolor':       'hand-drawn watercolor illustration style, ',
  'flat-vector':      'flat vector illustration, minimal clean style, ',
  'typography-humor': 'bold comic typography style, ',
  'kawaii':           'kawaii cute pastel illustration style, ',
  'cartoon-humor':    'Far Side cartoon humor style, comic illustration, ',
};

const TESTS = [
  { prompt: 'a cat wearing sunglasses, no text', styleTag: 'vintage-badge' },
  { prompt: 'a bear drinking coffee at a campfire', styleTag: 'flat-vector' },
  { prompt: 'a nurse sloth slowly checking vitals', styleTag: 'cartoon-humor' },
];

async function generate(label, model, body) {
  console.log(`  → ${label} [${model}]`);
  const start = Date.now();
  const res = await fetch('https://external.api.recraft.ai/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, n: 1, size: '1024x1024', response_format: 'url', ...body }),
  });
  const ms = Date.now() - start;
  if (!res.ok) {
    const text = await res.text();
    console.log(`     FAIL ${res.status}: ${text}`);
    return null;
  }
  const json = await res.json();
  const url = json.data?.[0]?.url;
  console.log(`     OK  ${ms}ms → ${url}`);
  return { label, model, url, ms };
}

console.log('=== Recraft API Test ===');
console.log(`Key: ${API_KEY.slice(0, 10)}...`);
console.log('Testing V4.1 (no style) vs V3 (style+substyle)\n');

const results = [];

for (const t of TESTS) {
  console.log(`\n[${t.styleTag}] "${t.prompt}"`);

  // V4.1 — style intent in prompt
  const v4Prompt = V4_PROMPT_PREFIX[t.styleTag] + t.prompt;
  const r4 = await generate('v4.1+prompt', 'recraftv4_1', { prompt: v4Prompt });
  if (r4) results.push({ ...r4, styleTag: t.styleTag, approach: 'v4.1 prompt-encoded' });

  // V3 — native style+substyle params
  const { style, substyle } = V3_STYLE_MAP[t.styleTag];
  const r3 = await generate('v3+substyle', 'recraftv3', { prompt: t.prompt, style, substyle });
  if (r3) results.push({ ...r3, styleTag: t.styleTag, approach: `v3 ${style}/${substyle}` });
}

console.log(`\n=== SUMMARY: ${results.length}/${TESTS.length * 2} succeeded ===\n`);

const lines = results.map(r =>
  `[${r.styleTag}] ${r.approach} — ${r.ms}ms\n${r.url}`
).join('\n\n');

const outPath = path.join(__dirname, 'recraft_test_results.txt');
writeFileSync(outPath, lines + '\n');
console.log('URLs saved → tools/recraft_test_results.txt');
console.log('Open each URL in browser to compare V4.1 vs V3 quality.');
