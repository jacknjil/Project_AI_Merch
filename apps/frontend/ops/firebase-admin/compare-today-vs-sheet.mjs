/**
 * Compare today's Firestore-generated assets against what the Google Sheet
 * says should have been generated (concept/phrase/product_category/niche).
 *
 * Read-only. Reuses the Sheets-fetch pattern from backfill-titles.mjs.
 *
 * Usage:
 *   node compare-today-vs-sheet.mjs [YYYY-MM-DD]   # defaults to today (UTC)
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';

const SHEET_ID    = '1qahisnJg8koBnqmruWLUsvqI3fEHW3AbEen5Y1AYZgM';
const SHEET_NAME  = 'AI Merch - Asset Generation System';
const BUCKET_NAME = 'ai-merch-dev.firebasestorage.app';

const dateArg = process.argv[2];
const dayStart = dateArg ? new Date(`${dateArg}T00:00:00Z`) : (() => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
})();

const jsonKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!jsonKey) { console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_JSON missing'); process.exit(1); }
const serviceAccount = JSON.parse(jsonKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: BUCKET_NAME,
});
const db = admin.firestore();

async function fetchSheetRows() {
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const token  = await client.getAccessToken();

  const range = encodeURIComponent(`${SHEET_NAME}!A1:Z2000`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);

  const data   = await res.json();
  const rows   = data.values ?? [];
  const header = rows[0].map(h => h.trim());
  const idx    = (name) => header.indexOf(name);

  const cols = {
    id: idx('id'), title: idx('title'), niche: idx('niche'), concept: idx('concept'),
    styleTag: idx('styleTag'), product_category: idx('product_category'),
    phrase: idx('phrase'), n8n_status: idx('n8n_status'), n8n_error: idx('n8n_error'),
    live_mode: idx('live-mode'), firebaseProductId: idx('firebaseProductId'),
  };

  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowId = String(row[cols.id] ?? '').trim();
    if (!rowId) continue;
    map[rowId] = {
      title: row[cols.title] ?? '',
      niche: row[cols.niche] ?? '',
      concept: row[cols.concept] ?? '',
      styleTag: row[cols.styleTag] ?? '',
      product_category: row[cols.product_category] ?? '',
      phrase: row[cols.phrase] ?? '',
      n8n_status: row[cols.n8n_status] ?? '',
      n8n_error: row[cols.n8n_error] ?? '',
      live_mode: row[cols.live_mode] ?? '',
      firebaseProductId: row[cols.firebaseProductId] ?? '',
    };
  }
  return map;
}

async function fetchTodayAssets() {
  const snap = await db.collection('assets')
    .where('createdAt', '>=', dayStart)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

async function main() {
  console.log(`Comparing Firestore assets created on/after ${dayStart.toISOString()} against the sheet...\n`);

  const [sheetMap, assets] = await Promise.all([fetchSheetRows(), fetchTodayAssets()]);
  console.log(`Sheet rows loaded: ${Object.keys(sheetMap).length}`);
  console.log(`Assets created today: ${assets.length}\n`);

  const mismatches = [];

  for (const a of assets) {
    const rowId = String(a.rowId ?? '').trim();
    const sheetRow = sheetMap[rowId];
    const issues = [];

    if (!sheetRow) {
      issues.push('no matching sheet row for this rowId');
    } else {
      if (sheetRow.niche && norm(sheetRow.niche) !== norm(a.niche)) {
        issues.push(`niche mismatch: sheet="${sheetRow.niche}" firestore="${a.niche}"`);
      }
      if (sheetRow.product_category && a.productCategory && norm(sheetRow.product_category) !== norm(a.productCategory)) {
        issues.push(`product_category mismatch: sheet="${sheetRow.product_category}" firestore="${a.productCategory}"`);
      }
      // Sheet phrase precedence: explicit text > "none" sentinel > blank (GPT decides)
      const sheetPhrase = norm(sheetRow.phrase);
      if (sheetPhrase && sheetPhrase !== 'none' && norm(a.phrase) !== sheetPhrase) {
        issues.push(`phrase mismatch: sheet="${sheetRow.phrase}" firestore="${a.phrase}"`);
      }
      if (sheetPhrase === 'none' && a.phrase) {
        issues.push(`sheet says phrase="none" but firestore has phrase="${a.phrase}"`);
      }
      if (sheetRow.n8n_status && !['done'].includes(norm(sheetRow.n8n_status))) {
        issues.push(`sheet n8n_status="${sheetRow.n8n_status}" (not "done") despite asset existing`);
      }
      if (sheetRow.n8n_error) {
        issues.push(`sheet n8n_error is non-empty: "${sheetRow.n8n_error}"`);
      }
      if (!sheetRow.firebaseProductId) {
        issues.push(`sheet firebaseProductId is empty (asset exists but sheet wasn't written back)`);
      } else if (sheetRow.firebaseProductId.trim() !== a.id) {
        issues.push(`sheet firebaseProductId="${sheetRow.firebaseProductId}" does not match this asset id="${a.id}"`);
      }
    }

    if (a.primaryOverlayApplied === false) issues.push('primaryOverlayApplied=false (phrase overlay failed)');
    if (a.secondaryOverlayApplied === false) issues.push('secondaryOverlayApplied=false (secondary phrase overlay failed)');

    console.log(`${issues.length ? '✗' : '✓'} rowId ${rowId.padEnd(4)} (${a.id})`);
    console.log(`    firestore: niche="${a.niche}" category="${a.productCategory}" phrase="${a.phrase}" secondary="${a.phraseSecondary || ''}"`);
    if (sheetRow) {
      console.log(`    sheet:     niche="${sheetRow.niche}" category="${sheetRow.product_category}" phrase="${sheetRow.phrase}" status="${sheetRow.n8n_status}"`);
    }
    if (issues.length) {
      for (const i of issues) console.log(`    ⚠ ${i}`);
      mismatches.push({ rowId, assetId: a.id, issues });
    }
    console.log();
  }

  console.log('─'.repeat(70));
  console.log(`SUMMARY: ${assets.length} assets checked, ${mismatches.length} with mismatches`);
  if (mismatches.length) {
    console.log('\nRows needing attention:', mismatches.map(m => m.rowId).join(', '));
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
