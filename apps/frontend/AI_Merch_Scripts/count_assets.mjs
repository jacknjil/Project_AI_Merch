// One-off diagnostic: count /assets totals vs what the gallery query can return.
// Reads the service-account JSON from .env.production (NEXT_PUBLIC_FIREBASE_SERVICE_ACCOUNT_JSON).
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadServiceAccount() {
  const env = readFileSync(new URL('../.env.production', import.meta.url), 'utf8');
  const marker = 'NEXT_PUBLIC_FIREBASE_SERVICE_ACCOUNT_JSON=';
  const at = env.indexOf(marker);
  if (at === -1) throw new Error('NEXT_PUBLIC_FIREBASE_SERVICE_ACCOUNT_JSON not found in .env.production');
  // The stored value is the JSON body WITHOUT its outer braces, spanning
  // multiple lines (private key). Grab up to the next env-var line and re-wrap.
  const body = env.slice(at + marker.length);
  const next = body.search(/\n[A-Z_]+=/);
  let raw = (next === -1 ? body : body.slice(0, next)).trim();
  raw = raw.slice(0, raw.lastIndexOf('"') + 1); // body ends at the final string value's closing quote
  return JSON.parse(`{${raw}}`);
}

const app = initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore(app);

const all = await db.collection('assets').get();
const total = all.size;

let missingCreatedAt = 0;
let emptyImageUrl = 0;
let publishedTrue = 0;
const hosts = {};

all.forEach((doc) => {
  const d = doc.data() || {};
  if (d.createdAt == null && d.created_at == null) missingCreatedAt += 1;
  const img = d.imageUrl || '';
  if (!img) emptyImageUrl += 1;
  else {
    try { const h = new URL(img).hostname; hosts[h] = (hosts[h] || 0) + 1; } catch { hosts['(invalid-url)'] = (hosts['(invalid-url)'] || 0) + 1; }
  }
  if (d.published === true) publishedTrue += 1;
});

// What the gallery actually returns: orderBy(createdAt desc) limit 200
const gallerySnap = await db.collection('assets').orderBy('createdAt', 'desc').limit(200).get();

console.log('=== /assets diagnostic ===');
console.log('Total docs in /assets:        ', total);
console.log('Gallery query returns:        ', gallerySnap.size, '(orderBy createdAt desc, limit 200)');
console.log('--- exclusion breakdown ---');
console.log('Missing createdAt (excluded): ', missingCreatedAt);
console.log('Empty imageUrl (blank tile):  ', emptyImageUrl);
console.log('published === true:           ', publishedTrue);
console.log('--- imageUrl hosts ---');
for (const [h, n] of Object.entries(hosts).sort((a, b) => b[1] - a[1])) console.log(`  ${h}: ${n}`);

// thumbUrl audit — the gallery renders thumbUrl FIRST (src = thumbUrl || imageUrl).
let hasThumb = 0, thumbDiffersFromImage = 0;
const thumbHosts = {};
all.forEach((d) => {
  const data = d.data();
  if (data.thumbUrl) {
    hasThumb += 1;
    if (data.thumbUrl !== data.imageUrl) thumbDiffersFromImage += 1;
    try { const h = new URL(data.thumbUrl).hostname; thumbHosts[h] = (thumbHosts[h]||0)+1; } catch { thumbHosts['(invalid)'] = (thumbHosts['(invalid)']||0)+1; }
  }
});
console.log('--- thumbUrl audit ---');
console.log('docs with a thumbUrl field:        ', hasThumb);
console.log('thumbUrl differs from imageUrl:    ', thumbDiffersFromImage);
console.log('thumbUrl hosts:', JSON.stringify(thumbHosts));

// Live-fetch ALL imageUrls to find which Storage objects fail to load.
const docs = all.docs.map((d) => ({ id: d.id, title: d.data().title, url: d.data().thumbUrl || d.data().imageUrl })).filter((x) => x.url);
const statusCounts = {};
const broken = [];
const CONCURRENCY = 12;
for (let i = 0; i < docs.length; i += CONCURRENCY) {
  const batch = docs.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(async (x) => {
    try {
      const r = await fetch(x.url, { method: 'GET' });
      return { ...x, status: r.status, ct: r.headers.get('content-type') || '' };
    } catch (e) {
      return { ...x, status: 'ERR', ct: e.message };
    }
  }));
  for (const r of results) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    if (r.status !== 200) broken.push(r);
  }
}
console.log('--- live HTTP status for all', docs.length, 'imageUrls ---');
for (const [s, n] of Object.entries(statusCounts)) console.log(`  HTTP ${s}: ${n}`);
console.log('--- broken (non-200), up to 15 ---');
for (const b of broken.slice(0, 15)) console.log(`  ${b.status} [${b.id}] "${b.title || ''}" ${b.url.slice(0, 100)}`);

process.exit(0);
