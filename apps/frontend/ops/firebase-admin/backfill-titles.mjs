/**
 * Backfill asset titles from Google Sheet → Firestore.
 *
 * For every asset with a generic title ("AI generated design" etc.),
 * looks up the real title from the sheet by rowId, then updates Firestore.
 *
 * Usage:
 *   node backfill-titles.mjs            # dry-run (default)
 *   node backfill-titles.mjs --apply    # write to Firestore
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';

const DRY_RUN     = !process.argv.includes('--apply');
const SHEET_ID    = '1qahisnJg8koBnqmruWLUsvqI3fEHW3AbEen5Y1AYZgM';
const SHEET_NAME  = 'AI Merch - Asset Generation System';
const BUCKET_NAME = 'ai-merch-dev.firebasestorage.app';

const GENERIC_TITLES = new Set([
  'ai generated design',
  'design',
  'untitled',
  '',
]);

function isGeneric(title) {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  if (GENERIC_TITLES.has(t)) return true;
  if (/^.+\s+design$/.test(t)) return true;
  return false;
}

// ── Firebase ──────────────────────────────────────────────────────────────────
const jsonKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!jsonKey) { console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_JSON missing'); process.exit(1); }

const serviceAccount = JSON.parse(jsonKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: BUCKET_NAME,
});
const db = admin.firestore();

// ── Google Sheets (via service account) ───────────────────────────────────────
async function fetchSheetRows() {
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const token  = await client.getAccessToken();

  const range = encodeURIComponent(`${SHEET_NAME}!A1:Z2000`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;

  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API ${res.status}: ${body}`);
  }

  const data   = await res.json();
  const rows   = data.values ?? [];
  const header = rows[0].map(h => h.trim());

  const idIdx    = header.indexOf('id');
  const titleIdx = header.indexOf('title');

  if (idIdx === -1 || titleIdx === -1) {
    throw new Error(`Sheet missing 'id' or 'title' column. Found: ${header.join(', ')}`);
  }

  // Build map: rowId (string) → title
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const row   = rows[i];
    const rowId = String(row[idIdx] ?? '').trim();
    const title = String(row[titleIdx] ?? '').trim();
    if (rowId && title) map[rowId] = title;
  }
  return map;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '[DRY RUN] No changes will be written.\n' : '[APPLY] Writing to Firestore.\n');

  console.log('Fetching sheet titles...');
  const sheetMap = await fetchSheetRows();
  console.log(`Sheet rows loaded: ${Object.keys(sheetMap).length}\n`);

  console.log('Fetching Firestore assets...');
  const snap   = await db.collection('assets').get();
  const assets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Assets loaded: ${assets.length}\n`);

  const toUpdate = assets.filter(a => isGeneric(a.title));
  console.log(`Assets with generic titles: ${toUpdate.length}\n`);

  let matched   = 0;
  let unmatched = 0;
  let updated   = 0;
  const unresolved = [];

  for (const asset of toUpdate) {
    const rowId    = String(asset.rowId ?? '').trim();
    const newTitle = rowId ? sheetMap[rowId] : null;

    if (!newTitle || isGeneric(newTitle)) {
      unresolved.push({ id: asset.id, rowId, niche: asset.niche, currentTitle: asset.title });
      unmatched++;
      continue;
    }

    matched++;
    console.log(`  ${asset.id} | rowId:${rowId.padEnd(4)} | "${asset.title}" → "${newTitle}"`);

    if (!DRY_RUN) {
      await db.collection('assets').doc(asset.id).update({
        title: newTitle,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      updated++;
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`Matched (have sheet title) : ${matched}`);
  console.log(`Unresolved (no rowId/title): ${unmatched}`);
  if (!DRY_RUN) console.log(`Written to Firestore       : ${updated}`);

  if (unresolved.length > 0) {
    console.log('\nUNRESOLVED (need manual titles):');
    console.log('id,rowId,niche,currentTitle');
    for (const u of unresolved) {
      console.log(`"${u.id}","${u.rowId}","${u.niche || ''}","${u.currentTitle || ''}"`);
    }
  }

  if (DRY_RUN && matched > 0) {
    console.log('\nRun with --apply to write changes.');
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
