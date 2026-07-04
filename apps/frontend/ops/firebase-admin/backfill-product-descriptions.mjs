import { config } from 'dotenv';
import admin from 'firebase-admin';

config({ path: '.env.local' });

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

const IS_DRY_RUN = false; // flip to false to execute real Firestore writes

const PRINTIFY_BASE = 'https://api.printify.com/v1';

// Same blueprint IDs as src/lib/printify.ts's BLUEPRINT_IDS — verified 2026-06-25.
// Duplicated here (not imported) because this is a plain Node script, and
// printify.ts is a TypeScript module meant for the Next.js server runtime.
const BLUEPRINT_IDS = {
  shirt: 12,
  hoodie: 92,
  tote: 553,
  mug: 68,
  cup: 425,
};

// ─────────────────────────────────────────────────────────────────────────────

const b64Key = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
if (!b64Key) {
  console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_B64 is missing from .env');
  process.exit(1);
}

const printifyApiKey = process.env.PRINTIFY_API_KEY;
if (!printifyApiKey) {
  console.error('ERROR: PRINTIFY_API_KEY is missing from .env');
  process.exit(1);
}

const serviceAccount = JSON.parse(Buffer.from(b64Key, 'base64').toString('utf-8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function fetchBlueprintDescription(blueprintId) {
  const res = await fetch(`${PRINTIFY_BASE}/catalog/blueprints/${blueprintId}.json`, {
    headers: { Authorization: `Bearer ${printifyApiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printify blueprint fetch error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const rawDescription = data.description ?? '';
  // Printify's catalog copy includes raw HTML (e.g. wrapping <p> tags) —
  // strip tags since the product page renders this as plain text.
  const description = rawDescription.replace(/<[^>]+>/g, '').trim();
  return { title: data.title ?? '', description };
}

async function run() {
  console.log('─'.repeat(56));
  console.log(`MODE : ${IS_DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}`);
  console.log('─'.repeat(56));

  for (const [category, blueprintId] of Object.entries(BLUEPRINT_IDS)) {
    const snap = await db
      .collection('products')
      .where('product_category', '==', category)
      .where('active', '==', true)
      .get();

    if (snap.empty) {
      console.log(`[SKIP]     ${category.padEnd(6)} — no active product doc found`);
      continue;
    }

    const { title, description } = await fetchBlueprintDescription(blueprintId);
    if (!description) {
      console.log(`[SKIP]     ${category.padEnd(6)} — Printify blueprint ${blueprintId} returned no description`);
      continue;
    }

    for (const doc of snap.docs) {
      const existing = doc.data().description ?? '';
      if (existing.trim().length > 0) {
        console.log(`[SKIP]     ${category.padEnd(6)} products/${doc.id} — already has a description`);
        continue;
      }

      console.log(`[${IS_DRY_RUN ? 'DRY RUN' : 'WRITE'}]  ${category.padEnd(6)} products/${doc.id} ("${title}")`);
      console.log(`           description: ${description.slice(0, 200)}${description.length > 200 ? '…' : ''}`);

      if (!IS_DRY_RUN) {
        await doc.ref.set({ description }, { merge: true });
      }
    }
  }

  console.log('─'.repeat(56));
  console.log(IS_DRY_RUN ? 'Dry run complete. Set IS_DRY_RUN = false to execute.' : 'Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
