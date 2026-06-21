/**
 * One-time migration: fetch Printify mockup URLs for assets that have a
 * printifyProductId but no mockupUrl, and store the result on the Firestore doc.
 *
 * Run from repo root:
 *   node --env-file=apps/frontend/.env.local tools/backfill_mockup_urls.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 not set');

const apiKey = process.env.PRINTIFY_API_KEY;
const shopId = process.env.PRINTIFY_SHOP_ID;
if (!apiKey) throw new Error('PRINTIFY_API_KEY not set');
if (!shopId) throw new Error('PRINTIFY_SHOP_ID not set');

const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snap = await db.collection('assets')
  .where('printifyProductId', '!=', null)
  .get();

const needsMockup = snap.docs.filter((d) => !d.data().mockupUrl);

console.log(`Assets with printifyProductId: ${snap.size}`);
console.log(`Missing mockupUrl: ${needsMockup.length}`);

if (needsMockup.length === 0) {
  console.log('Nothing to backfill.');
  process.exit(0);
}

let updated = 0;
let failed = 0;

for (const doc of needsMockup) {
  const { printifyProductId, title } = doc.data();
  try {
    const res = await fetch(
      `https://api.printify.com/v1/shops/${shopId}/products/${printifyProductId}.json`,
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
    );

    if (!res.ok) {
      console.warn(`  SKIP ${title ?? doc.id}: Printify ${res.status}`);
      failed++;
      continue;
    }

    const data = await res.json();
    const images = data.images ?? [];
    const mockupUrl = (images.find((i) => i.is_default) ?? images[0])?.src ?? null;

    if (!mockupUrl) {
      console.warn(`  SKIP ${title ?? doc.id}: no images returned`);
      failed++;
      continue;
    }

    await doc.ref.update({ mockupUrl });
    console.log(`  OK   ${title ?? doc.id} → ${mockupUrl.slice(0, 60)}…`);
    updated++;
  } catch (err) {
    console.warn(`  ERR  ${title ?? doc.id}:`, err.message);
    failed++;
  }
}

console.log(`\nDone — updated: ${updated}, failed/skipped: ${failed}`);
