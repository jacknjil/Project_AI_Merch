import 'dotenv/config';
import admin from 'firebase-admin';
import { randomUUID } from 'crypto';

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

const IS_DRY_RUN = true; // flip to false to execute real generation + writes

const BUCKET_NAME = 'ai-merch-dev.firebasestorage.app';
const RECRAFT_BASE = 'https://external.api.recraft.ai/v1';

// Blank, front-facing, straight-on flat-lay shots — this is the base layer
// KonvaComposer overlays a design onto in /studio/compose, so it must be a
// plain product with no existing print, centered, no perspective angle.
// (2026-07-03 run: shirt/hoodie/mug/cup came out clean on the first prompt;
// tote needed the stronger "isolated product catalog photo, no photography
// equipment" wording below after the first pass generated a lifestyle scene.)
const TEMPLATES = [
  {
    category: 'shirt',
    name: 'Classic Tee',
    price: 25,
    prompt:
      'Plain white cotton crewneck t-shirt, flat lay, front view, straight-on, perfectly centered, no folds, no wrinkles, no text, no logo, no print, studio product photography, plain light grey background, even soft lighting',
  },
  {
    category: 'hoodie',
    name: 'Pullover Hoodie',
    price: 25,
    prompt:
      'Plain black pullover hoodie, flat lay, front view, straight-on, perfectly centered, no folds, no wrinkles, no text, no logo, no print, studio product photography, plain light grey background, even soft lighting',
  },
  {
    category: 'tote',
    name: 'Canvas Tote Bag',
    price: 25,
    prompt:
      'Plain black canvas tote bag laid flat on a seamless plain light grey background, front view, straight-on, perfectly centered, isolated product catalog photo, no text, no logo, no print, no other objects, no photography equipment, no room or studio visible, even soft lighting',
  },
  {
    category: 'mug',
    name: 'Ceramic Mug',
    price: 25,
    prompt:
      'Plain white ceramic mug, front view, straight-on, perfectly centered, handle to the right, no text, no logo, no print, studio product photography, plain light grey background, even soft lighting',
  },
  {
    category: 'cup',
    name: 'Ceramic Cup',
    price: 25,
    prompt:
      'Plain white ceramic cup, front view, straight-on, perfectly centered, no text, no logo, no print, studio product photography, plain light grey background, even soft lighting',
  },
];

// ─────────────────────────────────────────────────────────────────────────────

const jsonKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!jsonKey) {
  console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_JSON is missing from .env');
  process.exit(1);
}

const recraftApiKey = process.env.RECRAFT_API_KEY;
if (!IS_DRY_RUN && !recraftApiKey) {
  console.error('ERROR: RECRAFT_API_KEY is missing from .env');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(jsonKey)),
  storageBucket: BUCKET_NAME,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function recraftGenerate(prompt) {
  const res = await fetch(`${RECRAFT_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${recraftApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'recraftv3',
      prompt,
      style: 'realistic_image',
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Recraft generate error ${res.status}: ${text}`);
  }

  const json = await res.json();
  const url = json.data?.[0]?.url;
  if (!url) throw new Error(`Recraft generate: no URL in response ${JSON.stringify(json).slice(0, 200)}`);
  return url;
}

function makeFirebaseDownloadUrl(storagePath, token) {
  const encPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encPath}?alt=media&token=${token}`;
}

async function uploadPngAndGetUrl(storagePath, png) {
  const file = bucket.file(storagePath);
  const token = randomUUID();

  await file.save(png, {
    resumable: false,
    contentType: 'image/png',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });

  return makeFirebaseDownloadUrl(storagePath, token);
}

async function run() {
  console.log('─'.repeat(56));
  console.log(`MODE : ${IS_DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE GENERATE + WRITE'}`);
  console.log(`COUNT: ${TEMPLATES.length} product templates`);
  console.log('─'.repeat(56));

  for (const tpl of TEMPLATES) {
    if (IS_DRY_RUN) {
      console.log(`[DRY RUN]  ${tpl.category.padEnd(6)} "${tpl.name}"`);
      console.log(`           prompt: ${tpl.prompt}`);
      continue;
    }

    console.log(`[GENERATE] ${tpl.category.padEnd(6)} "${tpl.name}"…`);
    const recraftUrl = await recraftGenerate(tpl.prompt);

    const imgRes = await fetch(recraftUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch generated image: ${imgRes.status}`);
    const png = Buffer.from(await imgRes.arrayBuffer());

    const storagePath = `products/${tpl.category}-${Date.now()}.png`;
    const mockupImageUrl = await uploadPngAndGetUrl(storagePath, png);
    console.log(`[UPLOADED] ${storagePath}`);

    const docRef = await db.collection('products').add({
      name: tpl.name,
      description: '',
      price: tpl.price,
      base_price: tpl.price,
      active: true,
      featured: false,
      mockupImageUrl,
      defaultAssetId: null,
      product_category: tpl.category,
      createdAt: Date.now(),
    });
    console.log(`[CREATED]  products/${docRef.id}`);
  }

  console.log('─'.repeat(56));
  if (IS_DRY_RUN) {
    console.log('Dry run complete. Set IS_DRY_RUN = false to execute.');
  } else {
    console.log('Done.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
