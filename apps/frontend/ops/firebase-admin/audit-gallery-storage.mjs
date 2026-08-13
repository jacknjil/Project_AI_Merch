import 'dotenv/config';
import admin from 'firebase-admin';

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

const BUCKET_NAME = 'ai-merch-dev.firebasestorage.app';

// Mirrors the /gallery page query: src/app/gallery/page.tsx
const GALLERY_QUERY_LIMIT = 200;

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

async function getGalleryRenderedAssets() {
  const snap = await db
    .collection('assets')
    .orderBy('createdAt', 'desc')
    .limit(GALLERY_QUERY_LIMIT)
    .get();

  return snap.docs
    .filter((d) => d.data().importSource !== 'printify-import')
    .map((d) => ({ id: d.id, ...d.data() }));
}

async function getAllStoragePaths() {
  const [files] = await bucket.getFiles();
  return new Set(files.map((f) => f.name));
}

async function main() {
  console.log('Fetching gallery-rendered assets from Firestore...');
  const galleryAssets = await getGalleryRenderedAssets();
  console.log(`Gallery renders ${galleryAssets.length} assets\n`);

  console.log('Listing all objects in Storage bucket...');
  const storagePaths = await getAllStoragePaths();
  console.log(`Storage bucket has ${storagePaths.size} objects\n`);

  // --- Firestore docs (rendered on gallery) missing their Storage file ---
  const missingStorage = galleryAssets.filter((a) => {
    if (!a.storagePath) return true;
    return !storagePaths.has(a.storagePath);
  });

  // --- Storage objects with no matching Firestore doc rendered on gallery ---
  const referencedPaths = new Set(
    galleryAssets.map((a) => a.storagePath).filter(Boolean)
  );
  const orphanedStorage = [...storagePaths].filter((p) => !referencedPaths.has(p));

  // --- Report ---
  console.log('─'.repeat(70));
  console.log(`MISSING STORAGE FILES (${missingStorage.length}) — gallery renders these, but no matching Storage object exists:`);
  console.log('─'.repeat(70));
  for (const a of missingStorage) {
    const label = a.title || a.niche || '(no title)';
    console.log(`  ${a.id.padEnd(22)} | storagePath: ${(a.storagePath || '(none)').padEnd(40)} | "${label}"`);
  }

  console.log(`\nORPHANED STORAGE OBJECTS (${orphanedStorage.length}) — exist in Storage, but not referenced by any gallery-rendered asset:`);
  console.log('─'.repeat(70));
  for (const p of orphanedStorage) {
    console.log(`  ${p}`);
  }

  console.log(`\nSUMMARY: ${galleryAssets.length} gallery assets, ${missingStorage.length} missing Storage files, ${orphanedStorage.length} orphaned Storage objects`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
