import 'dotenv/config';
import admin from 'firebase-admin';

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

// Firestore document IDs to delete. Leave empty to do nothing.
const IDS_TO_DELETE = [];

const IS_DRY_RUN = true; // flip to false to execute real deletes

const BUCKET_NAME = 'ai-merch-dev.firebasestorage.app';

// ─────────────────────────────────────────────────────────────────────────────

const jsonKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!jsonKey) {
  console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_JSON is missing from .env');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(jsonKey)),
  storageBucket: BUCKET_NAME,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function run() {
  if (IDS_TO_DELETE.length === 0) {
    console.log('IDS_TO_DELETE is empty — nothing to do.');
    process.exit(0);
  }

  console.log('─'.repeat(56));
  console.log(`MODE : ${IS_DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE DELETE'}`);
  console.log(`COUNT: ${IDS_TO_DELETE.length} IDs`);
  console.log('─'.repeat(56));

  let deleted = 0;
  let missing = 0;

  for (const id of IDS_TO_DELETE) {
    const ref = db.collection('assets').doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      console.log(`[MISSING]  ${id} — not in Firestore, skipping`);
      missing++;
      continue;
    }

    const data = snap.data();
    const storagePath = data.storagePath;
    const label = data.title || data.niche || '(no title)';

    if (IS_DRY_RUN) {
      console.log(`[DRY RUN]  ${id}  "${label}"`);
      if (storagePath) {
        console.log(`           Storage : ${storagePath}`);
      } else {
        console.log('           Storage : (no storagePath — Storage file would be skipped)');
      }
      continue;
    }

    // Delete from Cloud Storage first
    if (storagePath) {
      try {
        await bucket.file(storagePath).delete();
        console.log(`[DELETED]  Storage  : ${storagePath}`);
      } catch {
        console.warn(`[WARN]     Storage file not found: ${storagePath}`);
      }
    } else {
      console.warn(`[WARN]     ${id} has no storagePath — Storage file not deleted`);
    }

    // Delete from Firestore
    await ref.delete();
    console.log(`[DELETED]  Firestore: ${id}  "${label}"`);
    deleted++;
  }

  console.log('─'.repeat(56));
  if (IS_DRY_RUN) {
    console.log(`Dry run complete. ${IDS_TO_DELETE.length - missing} would be deleted, ${missing} not found.`);
    console.log('Set IS_DRY_RUN = false to execute.');
  } else {
    console.log(`Done. Deleted: ${deleted}  Not found: ${missing}`);
  }
}

run().catch(console.error);
