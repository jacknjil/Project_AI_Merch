import 'dotenv/config';
import admin from 'firebase-admin';

const BUCKET_NAME = 'ai-merch-dev.firebasestorage.app';

const jsonKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!jsonKey) { console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_JSON missing'); process.exit(1); }

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(jsonKey)),
  storageBucket: BUCKET_NAME,
});

const db = admin.firestore();

// Patterns that indicate a generic/placeholder title
const GENERIC_PATTERNS = [
  /^.+\s+design$/i,       // "[anything] Design"
  /^ai generated design$/i,
  /^design$/i,
  /^untitled$/i,
];

function isGeneric(title) {
  if (!title) return true;
  return GENERIC_PATTERNS.some(p => p.test(title.trim()));
}

async function main() {
  const snap = await db.collection('assets').get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Total assets: ${all.length}\n`);

  // --- Generic titles ---
  const generic = all.filter(a => isGeneric(a.title));

  // --- Duplicates ---
  const titleCount = {};
  for (const a of all) {
    const t = (a.title || '').trim().toLowerCase();
    titleCount[t] = (titleCount[t] || 0) + 1;
  }
  const duplicates = all.filter(a => {
    const t = (a.title || '').trim().toLowerCase();
    return titleCount[t] > 1;
  }).sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  // --- Report ---
  console.log(`GENERIC TITLES (${generic.length}):`);
  console.log('─'.repeat(70));
  for (const a of generic) {
    console.log(`  ${a.id.padEnd(22)} | niche: ${(a.niche||'').padEnd(20)} | "${a.title}"`);
  }

  console.log(`\nDUPLICATE TITLES (${duplicates.length} assets):`);
  console.log('─'.repeat(70));
  for (const a of duplicates) {
    const t = (a.title || '').trim().toLowerCase();
    console.log(`  ${a.id.padEnd(22)} | count: ${titleCount[t]} | "${a.title}"`);
  }

  // --- CSV for easy editing ---
  const flagged = [...new Map([...generic, ...duplicates].map(a => [a.id, a])).values()];
  console.log(`\nFLAGGED TOTAL: ${flagged.length} assets\n`);
  console.log('id,title,niche,rowId');
  for (const a of flagged) {
    const title = (a.title || '').replace(/"/g, '""');
    const niche = (a.niche || '').replace(/"/g, '""');
    console.log(`"${a.id}","${title}","${niche}","${a.rowId || ''}"`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
