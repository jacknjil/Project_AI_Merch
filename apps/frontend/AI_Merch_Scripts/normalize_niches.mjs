/**
 * Firestore asset niche normalization.
 * Run: node AI_Merch_Scripts/normalize_niches.mjs [--dry-run]
 *
 * Reads all assets, reports niche distribution, then normalizes
 * composite/legacy niche names to canonical single-word values.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Canonical niche map ────────────────────────────────────────────────────────
// Left = value found in Firestore | Right = canonical replacement
const NICHE_MAP = {
  // Pets (spaced-slash format from early n8n runs)
  'pets / cat lovers':    'cats',
  'pets / rescue cats':   'cats',
  'pets / dog lovers':    'dogs',

  // Outdoors
  'outdoors / hiking':    'hiking',
  'outdoors / adventure': 'outdoors',
  'surf / beach life':    'outdoors',
  'minimal / outdoors':   'outdoors',
  'biking / outdoors':    'outdoors',
  'camping / outdoors':   'camping',

  // Wildlife
  'wildlife / outdoors':  'wildlife',
  'wildlife / nature':    'wildlife',

  // Gaming
  'gaming / lifestyle':   'gaming',
  'gaming / retro':       'gaming',

  // Music
  'music / lifestyle':    'music',
  'music / guitar':       'music',

  // Coffee
  'coffee / lifestyle':   'coffee',
  'coffee / humor':       'coffee',
  'coffer humor':         'coffee',   // typo fix

  // Food
  'food / humor':         'food',
  'BBQ / cooking':        'food',
  'baking / humor':       'food',

  // Fitness / Wellness
  'fitness / gym':        'fitness',
  'wellness / yoga':      'wellness',
  'wellness / walking':   'wellness',

  // Streetwear
  'skate / streetwear':   'streetwear',

  // Trades
  'trades / engineering': 'trades',
  'trades / mechanics':   'trades',

  // Education
  'education / science':  'education',

  // Tech (no-space variant found in dry run)
  'tech/productivity':    'tech',
};

// ── Init Firebase ──────────────────────────────────────────────────────────────
const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
if (!b64) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT_B64 env var.');
  process.exit(1);
}

const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${DRY_RUN ? '🔍 DRY RUN — no writes' : '✏️  LIVE RUN — will update Firestore'}\n`);

  const snap = await db.collection('assets').get();
  const docs = snap.docs;
  console.log(`Total assets in Firestore: ${docs.length}\n`);

  // Audit: count by current niche value
  const nicheCounts = {};
  for (const doc of docs) {
    const niche = doc.data().niche ?? '(empty)';
    nicheCounts[niche] = (nicheCounts[niche] ?? 0) + 1;
  }

  console.log('── Current niche distribution ──────────────────────');
  for (const [niche, count] of Object.entries(nicheCounts).sort()) {
    const canonical = NICHE_MAP[niche];
    const flag = canonical ? `  →  ${canonical}` : '  ✓ canonical';
    console.log(`  ${String(count).padStart(3)}  ${niche}${flag}`);
  }
  console.log('');

  // Collect docs that need updating
  const toUpdate = docs.filter((doc) => {
    const niche = doc.data().niche;
    return niche && NICHE_MAP[niche];
  });

  console.log(`Assets to normalize: ${toUpdate.length}\n`);

  if (toUpdate.length === 0) {
    console.log('Nothing to do — all niches are already canonical.');
    return;
  }

  if (DRY_RUN) {
    console.log('── Would update ────────────────────────────────────');
    for (const doc of toUpdate) {
      const old = doc.data().niche;
      console.log(`  ${doc.id.slice(0, 12)}…  "${old}"  →  "${NICHE_MAP[old]}"`);
    }
    console.log('\nRe-run without --dry-run to apply.');
    return;
  }

  // Batch write (Firestore max 500 per batch)
  let updated = 0;
  const BATCH_SIZE = 400;

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    for (const doc of chunk) {
      const canonical = NICHE_MAP[doc.data().niche];
      batch.update(doc.ref, { niche: canonical });
      updated++;
    }
    await batch.commit();
    console.log(`  Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} docs)`);
  }

  console.log(`\n✅ Done — ${updated} assets updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
