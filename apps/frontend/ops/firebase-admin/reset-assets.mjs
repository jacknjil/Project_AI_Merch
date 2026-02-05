import 'dotenv/config'; // This loads the .env file immediately
import admin from 'firebase-admin';

// 1. Grab the raw JSON string from your .env
// --- CONFIGURATION (The script needs these!) ---
const BUCKET_NAME = 'ai-merch-dev.firebasestorage.app';
const LOOKBACK_DAYS = 5; // <--- The script was missing this!
const IS_DRY_RUN = false;

// 1. Grab the raw JSON string from your .env
const jsonKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON; // <-- This creates the name

// 2. Use that SAME name to check if it exists
if (!jsonKey) {
  console.error(
    '❌ ERROR: FIREBASE_SERVICE_ACCOUNT_JSON is missing from .env!',
  );
  process.exit(1);
}

// 3. Use that SAME name to parse it
const serviceAccount = JSON.parse(jsonKey);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'ai-merch-dev.firebasestorage.app',
});
// ... the rest of your runSurgicalReset() function below ...
const db = admin.firestore();
const bucket = admin.storage().bucket();

async function runSurgicalReset() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  console.log('--------------------------------------------------');
  console.log(
    `🚀 MODE: ${IS_DRY_RUN ? 'DRY RUN (Viewing only)' : 'LIVE DELETE (Careful!)'}`,
  );
  console.log(`📅 Targeting assets created BEFORE: ${cutoff.toISOString()}`);
  console.log('--------------------------------------------------');

  // Query Firestore for old assets
  const snapshot = await db
    .collection('assets')
    .where('createdAt', '<', cutoff)
    .get();

  if (snapshot.empty) {
    console.log('✅ No old assets found matching that date. Nothing to do.');
    return;
  }

  console.log(`Found ${snapshot.size} assets to process...`);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const storagePath = data.storagePath;

    if (IS_DRY_RUN) {
      console.log(
        `[DRY RUN] Would delete: ${doc.id} (File: ${storagePath || 'None'})`,
      );
    } else {
      // 1. Delete from Cloud Storage
      if (storagePath) {
        try {
          await bucket.file(storagePath).delete();
          console.log(`🗑️ Deleted Storage File: ${storagePath}`);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          console.warn(`⚠️ File not found or skip: ${storagePath}`);
        }
      }

      // 2. Delete from Firestore
      await doc.ref.delete();
      console.log(`🗑️ Deleted Firestore Doc: ${doc.id}`);
    }
  }

  if (IS_DRY_RUN) {
    console.log(
      '\n✨ Dry run complete. To delete for real, set IS_DRY_RUN = false in the script.',
    );
  } else {
    console.log('\n✨ Cleanup finished successfully.');
  }
}

runSurgicalReset().catch(console.error);
