/**
 * Backfill the Google Sheet's write-back columns for specific rowIds using
 * Firestore as ground truth. Written to correct the 2026-08-07 batch, whose
 * sheet write-back was broken by two bugs in n8n's "Master parse response"
 * node (see memory: project_row355_357_phrase_writeback_mismatch.md) —
 * firebaseProductId was hardcoded empty, and phraseWriteBack used a
 * positional lookup that cross-wired phrases on partial-failure runs.
 * Both bugs are now fixed in the live workflow; this script repairs the
 * sheet data that was already written wrong before the fix.
 *
 * Writes exactly the columns "Update row in sheet" normally writes:
 * n8n_status, n8n_error, assetIds, imageUrl, firebaseProductId, published,
 * lastRun, phrase. Matches sheet rows by the `id` column, same as the node.
 *
 * Usage:
 *   node backfill-writeback-rows.mjs --dry-run   # preview only (default)
 *   node backfill-writeback-rows.mjs --apply      # write for real
 */

import 'dotenv/config';
import { GoogleAuth } from 'google-auth-library';

const SHEET_ID   = '1qahisnJg8koBnqmruWLUsvqI3fEHW3AbEen5Y1AYZgM';
const SHEET_NAME = 'AI Merch - Asset Generation System';
const APPLY       = process.argv.includes('--apply');

// Ground truth pulled from Firestore for the 2026-08-07 batch (rowId -> canonical asset).
const CANONICAL = {
  353: { id: 'lK62Z8fkiskZcjZ6kqIJ', phrase: 'BORN TO ROAM', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/ai-merch-dev.firebasestorage.app/o/assets%2F353-VBrB5r1mXLBKbnKuVno4-1786106665848-1.png?alt=media&token=ca9a9442-ac65-4235-b2a3-0968161d58b5', published: false, createdAt: '2026-08-07T12:44:27.175Z' },
  354: { id: 'nl9M8GM29UIpnYCtd5sM', phrase: 'SLOW DOWN', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/ai-merch-dev.firebasestorage.app/o/assets%2F354-Bpp5f4CA3zcvElTo1oOF-1786110701021-1.png?alt=media&token=42cba6d7-2018-440f-b25c-69a5cd4bd19c', published: false, createdAt: '2026-08-07T13:51:41.526Z' },
  355: { id: 'oHhZEj0fsO9rZ7VKfooD', phrase: 'DISTINGUISHED SINCE BIRTH', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/ai-merch-dev.firebasestorage.app/o/assets%2F355-pmkao083cAupeJu8BUBV-1786106862646-1.png?alt=media&token=ce759757-cc1e-4b7d-aa7d-64fce54b7e71', published: false, createdAt: '2026-08-07T12:47:43.208Z' },
  356: { id: 'jH5xWOT4swbBpMCmKf1o', phrase: 'HEAL FROM WITHIN', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/ai-merch-dev.firebasestorage.app/o/assets%2F356-5TRO2AMV5sy2UWO0ESAv-1786110701313-1.png?alt=media&token=cafe268d-505f-4079-95c7-45f808393eec', published: false, createdAt: '2026-08-07T13:51:41.796Z' },
  357: { id: 'XPQbEPDHHmwqmGf2wPZI', phrase: 'BUILT NOT BOUGHT', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/ai-merch-dev.firebasestorage.app/o/assets%2F357-oCwHuCMVLTZt41iyTriq-1786106861199-1.png?alt=media&token=2a136e66-5596-431c-ac57-e2f3d3fcf342', published: false, createdAt: '2026-08-07T12:47:41.791Z' },
  358: { id: 'QWBW3lLn2eIwaUrZVBly', phrase: 'MY STARTER NEEDS ME', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/ai-merch-dev.firebasestorage.app/o/assets%2F358-0MDYjyoycPs41jVE22Tp-1786106877889-1.png?alt=media&token=04fb6163-a29a-43c4-86df-810be97efc14', published: false, createdAt: '2026-08-07T12:47:58.411Z' },
  365: { id: 'wgYWipkrYeAmPaENulD7', phrase: 'SOL · ETERNAL LIGHT OF THE COSMOS', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/ai-merch-dev.firebasestorage.app/o/assets%2F365-izJp2eEp3cpo1Sow3XvQ-1786106667280-1.png?alt=media&token=0f357c23-89be-429e-9df2-fb1c4102c18f', published: false, createdAt: '2026-08-07T12:44:27.696Z' },
};

const jsonKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!jsonKey) { console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_JSON missing'); process.exit(1); }
const serviceAccount = JSON.parse(jsonKey);

async function getSheetToken() {
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  return token.token;
}

function colLetter(idx) {
  let s = '';
  idx += 1;
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

async function main() {
  const token = await getSheetToken();
  const range = encodeURIComponent(`${SHEET_NAME}!A1:Z2000`);
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;
  const res = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets GET ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const rows = data.values ?? [];
  const header = rows[0].map(h => h.trim());
  const idx = (name) => header.indexOf(name);

  const cols = {
    id: idx('id'), n8n_status: idx('n8n_status'), n8n_error: idx('n8n_error'),
    assetIds: idx('assetIds'), imageUrl: idx('imageUrl'), firebaseProductId: idx('firebaseProductId'),
    published: idx('published'), lastRun: idx('lastRun'), phrase: idx('phrase'),
  };
  for (const [name, i] of Object.entries(cols)) {
    if (i === -1) { console.error(`ERROR: column "${name}" not found in sheet header`); process.exit(1); }
  }

  // Map id -> sheet row number (1-indexed, matching the raw range)
  const rowNumberById = {};
  for (let i = 1; i < rows.length; i++) {
    const rowId = String(rows[i][cols.id] ?? '').trim();
    if (rowId) rowNumberById[rowId] = i + 1; // +1 because range starts at row 1
  }

  const updates = [];
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — backfilling ${Object.keys(CANONICAL).length} rows\n`);

  for (const [rowId, asset] of Object.entries(CANONICAL)) {
    const sheetRowNum = rowNumberById[rowId];
    if (!sheetRowNum) {
      console.log(`✗ rowId ${rowId}: not found in sheet, skipping`);
      continue;
    }
    const values = {
      n8n_status: 'done',
      n8n_error: '',
      assetIds: asset.id,
      imageUrl: asset.imageUrl,
      firebaseProductId: asset.id,
      published: asset.published,
      lastRun: asset.createdAt,
      phrase: asset.phrase,
    };
    console.log(`rowId ${rowId} (sheet row ${sheetRowNum}): firebaseProductId="${asset.id}" phrase="${asset.phrase}"`);
    for (const [colName, value] of Object.entries(values)) {
      const a1 = `${SHEET_NAME}!${colLetter(cols[colName])}${sheetRowNum}`;
      updates.push({ range: a1, values: [[value]] });
    }
  }

  console.log(`\n${updates.length} cell updates prepared.`);
  if (!APPLY) {
    console.log('Dry run only — pass --apply to write.');
    return;
  }

  const putUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`;
  const putRes = await fetch(putUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data: updates }),
  });
  if (!putRes.ok) throw new Error(`Sheets batchUpdate ${putRes.status}: ${await putRes.text()}`);
  const result = await putRes.json();
  console.log(`✓ Updated ${result.totalUpdatedCells} cells across ${result.totalUpdatedRows} rows.`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
