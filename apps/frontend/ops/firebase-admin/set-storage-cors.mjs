import 'dotenv/config';
import admin from 'firebase-admin';

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

// Firebase Storage's download API (firebasestorage.googleapis.com/v0/...) only
// sends Access-Control-Allow-Origin on OPTIONS preflight, not on the actual GET
// response — so any browser code loading images in CORS mode (e.g. Konva's
// useImage(url, 'anonymous'), required to keep the canvas untainted for
// toDataURL()) gets blocked. Fix: set CORS directly on the underlying GCS bucket.
const IS_DRY_RUN = true; // flip to false to apply

const BUCKET_NAME = 'ai-merch-dev.firebasestorage.app';

const CORS_CONFIG = [
  {
    origin: ['http://localhost:3000', 'https://ai-merch.jjrsguide.com'],
    method: ['GET', 'HEAD'],
    responseHeader: ['Content-Type'],
    maxAgeSeconds: 3600,
  },
];

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

const bucket = admin.storage().bucket();

async function run() {
  console.log('─'.repeat(56));
  console.log(`MODE   : ${IS_DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE APPLY'}`);
  console.log(`BUCKET : ${BUCKET_NAME}`);
  console.log('─'.repeat(56));

  const [existingMeta] = await bucket.getMetadata();
  console.log('Current CORS config:', JSON.stringify(existingMeta.cors ?? [], null, 2));
  console.log('Proposed CORS config:', JSON.stringify(CORS_CONFIG, null, 2));

  if (IS_DRY_RUN) {
    console.log('─'.repeat(56));
    console.log('Dry run complete. Set IS_DRY_RUN = false to apply.');
    return;
  }

  await bucket.setMetadata({ cors: CORS_CONFIG });
  console.log('─'.repeat(56));
  console.log('CORS config applied.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
