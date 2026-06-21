/**
 * One-time migration: backfill `createdAt` on Firestore /assets documents that
 * are missing the field. Uses each document's Firestore createTime metadata so
 * the timestamp reflects when the document was actually written, not when this
 * script ran.
 *
 * Run from repo root:
 *   node --env-file=apps/frontend/.env.local tools/backfill_created_at.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 not set');

const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snap = await db.collection('assets').get();

const missing = snap.docs.filter((d) => d.data().createdAt === undefined);

console.log(`Total assets: ${snap.size}`);
console.log(`Missing createdAt: ${missing.length}`);

if (missing.length === 0) {
  console.log('Nothing to backfill.');
  process.exit(0);
}

// Firestore batch limit is 500 writes
const BATCH_SIZE = 500;
let updated = 0;

for (let i = 0; i < missing.length; i += BATCH_SIZE) {
  const batch = db.batch();
  const chunk = missing.slice(i, i + BATCH_SIZE);

  for (const doc of chunk) {
    // doc.createTime is a Firestore Timestamp — the actual document creation time
    const createdAt = doc.createTime
      ? Timestamp.fromMillis(doc.createTime.toMillis())
      : Timestamp.now();

    batch.update(doc.ref, { createdAt });
  }

  await batch.commit();
  updated += chunk.length;
  console.log(`Committed ${updated}/${missing.length}`);
}

console.log(`Done — backfilled ${updated} documents.`);
