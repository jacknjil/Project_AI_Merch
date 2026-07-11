# Background-Removal Defect Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the defective (unremoved-background) Printify print files on 5 known live assets with corrected ones, without changing their customer-facing `/shop` URLs.

**Architecture:** A single throwaway Node script (never committed, deleted after use) drives the existing, already-proven `/api/publish-to-printify` endpoint to build a corrected replacement Printify product for each asset, patches `productCategory` onto the same Firestore doc, then deletes the old defective Printify product directly via the Printify REST API. No application code is created or modified — this is a one-off data-repair operation, matching the audit script's convention already used twice this session.

**Tech Stack:** Node 20 (`--env-file=.env.local`), `firebase-admin` (already a dependency), the running local dev server's `/api/publish-to-printify` route, Printify REST API (`DELETE /v1/shops/{shop_id}/products/{id}.json`).

## Global Constraints

- Run from `/home/ibjjr/Project_AI_Merch/apps/frontend` with `node --env-file=.env.local <script>.mjs` (matches the pattern used by this session's prior audit scripts — Node resolves `firebase-admin` from this directory's `node_modules`).
- The local dev server must be running on `http://localhost:3000` (`npm run dev` from `apps/frontend`) — the script calls its `/api/publish-to-printify` route rather than duplicating that route's logic.
- `productCategory` is hardcoded to `'shirt'` for all 5 assets (confirmed black-tee mockups in the reviewed screenshot).
- The old Printify product is deleted immediately after the new one is confirmed live in Firestore — never before (per approved design's safety section).
- Process asset 1 (`Espresso Yourself Typography`) alone first; pause for manual sanity check; only then process the remaining 4.
- The script file itself is **never committed** — delete it at the end of the plan, same convention as `check-archived-bg.mjs` and this session's audit scripts. Do not run `git add`/`git commit` on it at any point.
- Exact assets (Firestore doc ID | title | current/old `printifyProductId`):

  | Doc ID | Title | Old Printify Product ID |
  |---|---|---|
  | `bhS1XfyMYmMKPZJ3qZcF` | Espresso Yourself Typography | `6a46c68bfd17053d220ae3f8` |
  | `OjADemKuWemWqRddphsy` | Bear Hooked on Coffee | `6a37e739db0ae58ff9096dd6` |
  | `P5dHgNHrsvDPuyz93hIm` | Farmers' Market Upheaval | `6a37e90341155d651f0a6932` |
  | `EMOVPIyTXN6anPjhI6eF` | It's Okay To Not Be Okay Hand-Lettered Tee | `6a43c86946263fe7db0478e6` |
  | `H52UoNHvtca3d24Mc34X` | Adventure Buddy Hike More Vintage Tee | `6a453edb00bf6028a60b1050` |

---

### Task 1: Script skeleton + read-only data verification

**Files:**
- Create (temporary, not committed): `apps/frontend/remediate-bg-defect.mjs`

**Interfaces:**
- Produces: `db` (Firestore instance), `ASSETS` (array of `{ id, title }`), used by Tasks 2–4 in the same file.

- [ ] **Step 1: Write the script skeleton with a read-only verification pass**

```js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString())) });
}
const db = getFirestore();

const PRINTIFY_API_KEY = process.env.PRINTIFY_API_KEY;
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID;
const PRINTIFY_BASE = 'https://api.printify.com/v1';
const APP_BASE = 'http://localhost:3000';

const ASSETS = [
  { id: 'bhS1XfyMYmMKPZJ3qZcF', title: 'Espresso Yourself Typography' },
  { id: 'OjADemKuWemWqRddphsy', title: 'Bear Hooked on Coffee' },
  { id: 'P5dHgNHrsvDPuyz93hIm', title: "Farmers' Market Upheaval" },
  { id: 'EMOVPIyTXN6anPjhI6eF', title: "It's Okay To Not Be Okay Hand-Lettered Tee" },
  { id: 'H52UoNHvtca3d24Mc34X', title: 'Adventure Buddy Hike More Vintage Tee' },
];

async function verifyAssets() {
  for (const asset of ASSETS) {
    const doc = await db.collection('assets').doc(asset.id).get();
    const data = doc.data();
    console.log(
      asset.id, '|', data.title,
      '| imageUrl:', data.imageUrl ? 'present' : 'MISSING',
      '| oldProductId:', data.printifyProductId,
      '| niche:', data.niche,
    );
  }
}

await verifyAssets();
```

- [ ] **Step 2: Run it and verify output matches the Global Constraints table**

Run: `cd apps/frontend && node --env-file=.env.local remediate-bg-defect.mjs`

Expected: 5 lines printed, one per asset, each showing `imageUrl: present` and an `oldProductId` matching the table above exactly. If any line shows `imageUrl: MISSING` or a mismatched `oldProductId`, STOP — the asset ID list is stale and must be re-confirmed against Firestore before continuing to Task 2.

---

### Task 2: Remediate asset 1 only (build + verify, no deletion yet)

**Files:**
- Modify: `apps/frontend/remediate-bg-defect.mjs`

**Interfaces:**
- Consumes: `db`, `ASSETS`, `APP_BASE` from Task 1.
- Produces: `buildReplacement(asset)` — `async (asset: {id, title}) => { oldProductId: string, newProductId: string, mockupUrl: string }`, used by Task 3 and Task 4.

- [ ] **Step 1: Add the replacement-building function, replacing the `verifyAssets` call with a single-asset run**

Replace the `await verifyAssets();` line at the bottom of the file with:

```js
async function buildReplacement(asset) {
  const doc = await db.collection('assets').doc(asset.id).get();
  const data = doc.data();
  const oldProductId = data.printifyProductId;

  const res = await fetch(`${APP_BASE}/api/publish-to-printify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetId: asset.id,
      imageUrl: data.imageUrl,
      title: asset.title,
      productCategory: 'shirt',
      niche: data.niche,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`publish-to-printify failed for ${asset.id}: ${json.error ?? res.status}`);
  }

  await db.collection('assets').doc(asset.id).update({ productCategory: 'shirt' });

  const updatedDoc = await db.collection('assets').doc(asset.id).get();
  const mockupUrl = updatedDoc.data().mockupUrl;

  return { oldProductId, newProductId: json.printifyProductId, mockupUrl };
}

const result = await buildReplacement(ASSETS[0]);
console.log('Asset 1 remediated:', JSON.stringify(result, null, 2));
console.log('MANUAL CHECK: open the mockupUrl above in a browser and confirm no white background box.');
console.log('Old product NOT deleted yet — waiting for sanity check.');
```

- [ ] **Step 2: Run it**

Run: `cd apps/frontend && node --env-file=.env.local remediate-bg-defect.mjs`

Expected: prints a JSON object with `oldProductId: "6a46c68bfd17053d220ae3f8"`, a new `newProductId` (different value), and a `mockupUrl` pointing to `images.printify.com`.

- [ ] **Step 3: Manually verify the corrected mockup**

Open the printed `mockupUrl` directly in a browser tab. Confirm the design now sits directly on the black t-shirt with no white/light background box behind it. Also confirm in Firestore (or via a quick `db.collection('assets').doc('bhS1XfyMYmMKPZJ3qZcF').get()` in a throwaway check) that `productCategory` is now `'shirt'`.

**STOP HERE if the mockup still shows a background artifact or looks wrong in any way — do not proceed to Task 3 (deletion) until this is confirmed correct.**

---

### Task 3: Delete asset 1's old product, verify deletion

**Files:**
- Modify: `apps/frontend/remediate-bg-defect.mjs`

**Interfaces:**
- Consumes: `buildReplacement` from Task 2, `PRINTIFY_BASE`/`PRINTIFY_API_KEY`/`PRINTIFY_SHOP_ID` from Task 1.
- Produces: `deleteOldProduct(productId)` — `async (productId: string) => void`, used by Task 4.

- [ ] **Step 1: Add the delete function and call it for asset 1's old product**

Add above the `const result = await buildReplacement(ASSETS[0]);` line:

```js
async function deleteOldProduct(productId) {
  const res = await fetch(
    `${PRINTIFY_BASE}/shops/${PRINTIFY_SHOP_ID}/products/${productId}.json`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${PRINTIFY_API_KEY}` },
    },
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Delete failed for ${productId}: ${res.status} ${text}`);
  }
}
```

Then replace the three `console.log(...)` lines after `const result = ...` with:

```js
console.log('Asset 1 remediated:', JSON.stringify(result, null, 2));
console.log('MANUAL CHECK: open the mockupUrl above in a browser and confirm no white background box.');
console.log('Press Ctrl+C now if it looks wrong. Otherwise deleting old product in 10s...');
await new Promise((resolve) => setTimeout(resolve, 10000));
await deleteOldProduct(result.oldProductId);
console.log('Old product deleted:', result.oldProductId);
```

- [ ] **Step 2: Run it, using the 10-second window to check the mockup URL from Task 2 Step 3**

Run: `cd apps/frontend && node --env-file=.env.local remediate-bg-defect.mjs`

Expected: prints the result JSON, waits 10 seconds, then prints `Old product deleted: 6a46c68bfd17053d220ae3f8`.

- [ ] **Step 3: Verify the old product is actually gone**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $PRINTIFY_API_KEY" \
  "https://api.printify.com/v1/shops/$PRINTIFY_SHOP_ID/products/6a46c68bfd17053d220ae3f8.json"
```

Expected: `404` (confirms deletion). If this instead returns `200`, the delete call did not work — stop and investigate before proceeding to Task 4 (do not delete the remaining 4 old products until this is resolved).

---

### Task 4: Process the remaining 4 assets end-to-end

**Files:**
- Modify: `apps/frontend/remediate-bg-defect.mjs`

**Interfaces:**
- Consumes: `buildReplacement`, `deleteOldProduct`, `ASSETS` from Tasks 1–3.

- [ ] **Step 1: Replace the asset-1-only block with a loop over the remaining 4 assets**

Replace everything from `const result = await buildReplacement(ASSETS[0]);` to the end of the file with:

```js
for (const asset of ASSETS.slice(1)) {
  try {
    const result = await buildReplacement(asset);
    console.log(`${asset.title}: built replacement`, JSON.stringify(result));
    await deleteOldProduct(result.oldProductId);
    console.log(`${asset.title}: old product ${result.oldProductId} deleted`);
  } catch (err) {
    console.error(`${asset.title}: FAILED, old product left untouched —`, err.message);
  }
}
```

- [ ] **Step 2: Run it**

Run: `cd apps/frontend && node --env-file=.env.local remediate-bg-defect.mjs`

Expected: 4 pairs of lines (one "built replacement" + one "old product deleted" per asset), OR a "FAILED" line for any asset that errored (which leaves that asset's old product untouched and live — matching the safety design, not a script bug).

- [ ] **Step 3: Verify all 5 corrected mockups render on `/shop`**

Reload `http://localhost:3000/shop` in a real browser (not curl — this page is client-rendered) and visually confirm all 5 titles (Espresso Yourself Typography, Bear Hooked on Coffee, Farmers' Market Upheaval, It's Okay To Not Be Okay Hand-Lettered Tee, Adventure Buddy Hike More Vintage Tee) now show designs with no white background box behind them.

---

### Task 5: Clean up

**Files:**
- Delete: `apps/frontend/remediate-bg-defect.mjs`

- [ ] **Step 1: Remove the throwaway script**

Run: `rm apps/frontend/remediate-bg-defect.mjs`

- [ ] **Step 2: Confirm no trace was committed**

Run: `git status -s apps/frontend/remediate-bg-defect.mjs`

Expected: no output (file doesn't exist, nothing tracked, nothing staged). No commit is made for this task — the script was never part of the repo, per Global Constraints.
