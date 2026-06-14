/**
 * One-shot script: infer product_category from product name and write to Firestore.
 *
 * Reads FIREBASE_SERVICE_ACCOUNT_B64 from .env.local or .env.production.
 * Run from project root: node tools/set_product_categories.mjs [--dry-run]
 *
 * Products whose names contain no recognisable keyword are listed at the end
 * so you can set them manually via /admin/products.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDryRun = process.argv.includes('--dry-run');

// ── load env ──────────────────────────────────────────────────────────────────

function loadEnv(filePath) {
  try {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    const env = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const envLocal = loadEnv(resolve(__dirname, '../apps/frontend/.env.local'));
const envProd  = loadEnv(resolve(__dirname, '../apps/frontend/.env.production'));
const env      = { ...envProd, ...envLocal };

const b64 = env.FIREBASE_SERVICE_ACCOUNT_B64;
if (!b64) {
  console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_B64 not found in .env.local or .env.production');
  process.exit(1);
}

const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── category inference ────────────────────────────────────────────────────────

const KEYWORDS = [
  { category: 'hoodie', patterns: ['hoodie', 'hoody', 'sweatshirt'] },
  { category: 'shirt',  patterns: ['shirt', 'tee', 't-shirt', 'tshirt'] },
  { category: 'tote',   patterns: ['tote', 'bag', 'totebag'] },
  { category: 'mug',    patterns: ['mug', 'coffee mug', 'ceramic'] },
  { category: 'cup',    patterns: ['cup', 'tumbler', 'travel cup'] },
];

function inferCategory(name = '', existingCategory = '') {
  if (existingCategory) return existingCategory;
  const lower = name.toLowerCase();
  for (const { category, patterns } of KEYWORDS) {
    if (patterns.some((p) => lower.includes(p))) return category;
  }
  return null;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(isDryRun ? '🔍 DRY RUN — no writes will happen\n' : '✏️  LIVE RUN — writing to Firestore\n');

  const snap = await db.collection('products').get();
  console.log(`Found ${snap.size} products\n`);

  const toUpdate   = [];
  const alreadySet = [];
  const unknown    = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const existing = data.product_category ?? '';
    const inferred = inferCategory(data.name, existing);

    if (existing) {
      alreadySet.push({ id: docSnap.id, name: data.name, category: existing });
    } else if (inferred) {
      toUpdate.push({ id: docSnap.id, name: data.name, category: inferred });
    } else {
      unknown.push({ id: docSnap.id, name: data.name });
    }
  }

  if (alreadySet.length) {
    console.log(`✅ Already have product_category (${alreadySet.length} — skipping):`);
    for (const p of alreadySet) console.log(`   [${p.category}] ${p.name}`);
    console.log();
  }

  if (toUpdate.length) {
    console.log(`🏷️  Will set product_category (${toUpdate.length} products):`);
    for (const p of toUpdate) console.log(`   [${p.category}] ${p.name}`);
    console.log();
  }

  if (unknown.length) {
    console.log(`⚠️  Could not infer category (${unknown.length} — set manually via /admin/products):`);
    for (const p of unknown) console.log(`   [???] ${p.name}  (id: ${p.id})`);
    console.log();
  }

  if (!toUpdate.length) {
    console.log('Nothing to update.');
    return;
  }

  if (isDryRun) {
    console.log('Dry run complete. Re-run without --dry-run to apply.');
    return;
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    for (const p of chunk) {
      batch.update(db.collection('products').doc(p.id), {
        product_category: p.category,
      });
    }
    await batch.commit();
    console.log(`Wrote batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} docs)`);
  }

  console.log(`\n✅ Done. ${toUpdate.length} products updated.`);
  if (unknown.length) {
    console.log(`   ${unknown.length} products still need manual category — use /admin/products.`);
  }
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
