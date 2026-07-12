# Printify Upload Alpha-Preservation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop apparel products from shipping to Printify with a white box behind the design, by replacing Recraft's `crispUpscale` (which unconditionally flattens transparency to white) with a local, alpha-preserving upscale for the apparel image pipeline, and making the Printify upload function format-aware (PNG when alpha present, JPEG otherwise).

**Architecture:** Two new small functions in `src/lib/printify.ts` (`upscalePreservingAlpha`, `uploadBufferToPrintify`, plus a pure helper `pickUploadFormat`), consumed by a restructured apparel branch in `src/app/api/publish-to-printify/route.ts`. The existing `uploadImageToPrintify` is refactored to delegate to the new shared upload logic rather than duplicating it. The drinkware branch is untouched.

**Tech Stack:** TypeScript, Next.js 16 App Router (Node runtime route), `sharp` (already a dependency), Vitest.

## Global Constraints

- Node 20 required (`.nvmrc`) — run all commands from `apps/frontend/`.
- Testing convention (this repo, confirmed via `src/lib/printify.test.ts` and `docs/superpowers/specs/2026-07-11-background-removal-reliability-design.md`): Vitest for pure logic only, real `sharp` buffers where needed — **no `fetch`/external-API mocking infrastructure**. Route-level and network-touching logic is verified via `tsc --noEmit`, `npm run lint`, and manual live verification, not automated mocks.
- Commit message format: `<type>: <description>` (types: feat, fix, refactor, docs, test, chore). No `Co-Authored-By` trailer — attribution is disabled globally per this user's git-workflow rules.
- Design source of truth: `docs/superpowers/specs/2026-07-12-printify-upload-alpha-fix-design.md`.

---

### Task 1: Add `pickUploadFormat` pure helper

**Files:**
- Modify: `apps/frontend/src/lib/printify.ts` (add after the `PrintifyImageUpload` interface, currently lines 183-187)
- Test: `apps/frontend/src/lib/printify.test.ts` (append)

**Interfaces:**
- Produces: `export function pickUploadFormat(hasAlpha: boolean): 'png' | 'jpeg'` — used by Task 3.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/lib/printify.test.ts`:

```ts
describe('pickUploadFormat', () => {
  it('returns png when the image has an alpha channel', () => {
    expect(pickUploadFormat(true)).toBe('png');
  });

  it('returns jpeg when the image has no alpha channel', () => {
    expect(pickUploadFormat(false)).toBe('jpeg');
  });
});
```

Also update the existing import line at the top of the file from:

```ts
import { suggestCategoryForBlueprint, fetchAllPrintifyProducts, filterUnmatchedProducts, mapPrintifyImages, findOrphanedAssets, type AssetProductRef } from './printify';
```

to:

```ts
import { suggestCategoryForBlueprint, fetchAllPrintifyProducts, filterUnmatchedProducts, mapPrintifyImages, findOrphanedAssets, pickUploadFormat, type AssetProductRef } from './printify';
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/frontend/`): `npx vitest run src/lib/printify.test.ts`
Expected: FAIL — `pickUploadFormat` is not exported / not defined.

- [ ] **Step 3: Write minimal implementation**

In `apps/frontend/src/lib/printify.ts`, add this immediately after the `PrintifyImageUpload` interface (after line 187, before `export interface PrintifyProduct`):

```ts
export function pickUploadFormat(hasAlpha: boolean): 'png' | 'jpeg' {
  return hasAlpha ? 'png' : 'jpeg';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/printify.test.ts`
Expected: PASS, including the two new `pickUploadFormat` tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/printify.ts apps/frontend/src/lib/printify.test.ts
git commit -m "feat: add pickUploadFormat helper for alpha-aware Printify uploads"
```

---

### Task 2: Add `upscalePreservingAlpha`

**Files:**
- Modify: `apps/frontend/src/lib/printify.ts` (add after `pickUploadFormat`)
- Test: `apps/frontend/src/lib/printify.test.ts` (append)

**Interfaces:**
- Consumes: `sharp` (already imported at line 1 of `printify.ts`).
- Produces: `export async function upscalePreservingAlpha(buffer: Buffer, targetSize = 4096): Promise<Buffer>` — used by Task 4 (route).

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/lib/printify.test.ts`. This file does not currently import `sharp`; add the import at the top alongside the existing import:

```ts
import sharp from 'sharp';
```

Then append:

```ts
describe('upscalePreservingAlpha', () => {
  it('preserves alpha and resizes to the target dimensions', async () => {
    const transparentQuadrant = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();

    const input = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .composite([{ input: transparentQuadrant, left: 0, top: 0 }])
      .png()
      .toBuffer();

    const output = await upscalePreservingAlpha(input, 400);
    const meta = await sharp(output).metadata();

    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
  });
});
```

Update the `printify` import line (same one edited in Task 1) to also include `upscalePreservingAlpha`:

```ts
import { suggestCategoryForBlueprint, fetchAllPrintifyProducts, filterUnmatchedProducts, mapPrintifyImages, findOrphanedAssets, pickUploadFormat, upscalePreservingAlpha, type AssetProductRef } from './printify';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/printify.test.ts`
Expected: FAIL — `upscalePreservingAlpha` is not exported / not defined.

- [ ] **Step 3: Write minimal implementation**

In `apps/frontend/src/lib/printify.ts`, add immediately after `pickUploadFormat`:

```ts
export async function upscalePreservingAlpha(buffer: Buffer, targetSize = 4096): Promise<Buffer> {
  return sharp(buffer)
    .resize(targetSize, targetSize, { fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/printify.test.ts`
Expected: PASS, including the new `upscalePreservingAlpha` test.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/printify.ts apps/frontend/src/lib/printify.test.ts
git commit -m "feat: add upscalePreservingAlpha for alpha-safe local image upscaling"
```

---

### Task 3: Add `uploadBufferToPrintify` and refactor `uploadImageToPrintify`

**Files:**
- Modify: `apps/frontend/src/lib/printify.ts:195-222` (the existing `uploadImageToPrintify` function)

**Interfaces:**
- Consumes: `pickUploadFormat` (Task 1), `getCredentials()`, `authHeaders()`, `PRINTIFY_BASE`, `PrintifyImageUpload` (all already defined earlier in this file).
- Produces: `export async function uploadBufferToPrintify(buffer: Buffer, fileName: string): Promise<PrintifyImageUpload>` — used by Task 4 (route). `uploadImageToPrintify`'s existing signature (`(imageUrl: string, fileName: string) => Promise<PrintifyImageUpload>`) is unchanged, so its existing caller in the drinkware branch of `publish-to-printify/route.ts` needs no changes.

No automated test for this task, per the Global Constraints testing convention (it makes a real `fetch` call to Printify's API). Verified via `tsc` in this task and manual live verification in Task 5.

- [ ] **Step 1: Replace the function**

In `apps/frontend/src/lib/printify.ts`, replace the current `uploadImageToPrintify` function (lines 195-222):

```ts
export async function uploadImageToPrintify(
  imageUrl: string,
  fileName: string,
): Promise<PrintifyImageUpload> {
  const { apiKey } = getCredentials();

  // Fetch server-side — Printify's servers are blocked from img.recraft.ai (CDN bot protection).
  // Convert to JPEG 80% quality: reduces the 10MB upscaled WebP to ~2-3MB before base64 encoding.
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image for Printify upload: ${imgRes.status}`);
  const imgBytes = await imgRes.arrayBuffer();
  const jpegBuffer = await sharp(Buffer.from(imgBytes)).jpeg({ quality: 80 }).toBuffer();
  const base64 = jpegBuffer.toString('base64');
  const safeFileName = fileName.replace(/\.[^.]+$/, '') + '.jpg';

  const res = await fetch(`${PRINTIFY_BASE}/uploads/images.json`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ file_name: safeFileName, contents: base64 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printify image upload error ${res.status}: ${text}`);
  }

  return res.json() as Promise<PrintifyImageUpload>;
}
```

with:

```ts
export async function uploadBufferToPrintify(
  buffer: Buffer,
  fileName: string,
): Promise<PrintifyImageUpload> {
  const { apiKey } = getCredentials();

  const meta = await sharp(buffer).metadata();
  const format = pickUploadFormat(!!meta.hasAlpha);

  const encoded = format === 'png'
    ? await sharp(buffer).png().toBuffer()
    : await sharp(buffer).jpeg({ quality: 80 }).toBuffer();
  const base64 = encoded.toString('base64');
  const safeFileName = fileName.replace(/\.[^.]+$/, '') + (format === 'png' ? '.png' : '.jpg');

  const res = await fetch(`${PRINTIFY_BASE}/uploads/images.json`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ file_name: safeFileName, contents: base64 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printify image upload error ${res.status}: ${text}`);
  }

  return res.json() as Promise<PrintifyImageUpload>;
}

export async function uploadImageToPrintify(
  imageUrl: string,
  fileName: string,
): Promise<PrintifyImageUpload> {
  // Fetch server-side — Printify's servers are blocked from img.recraft.ai (CDN bot protection).
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image for Printify upload: ${imgRes.status}`);
  const imgBytes = Buffer.from(await imgRes.arrayBuffer());
  return uploadBufferToPrintify(imgBytes, fileName);
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/frontend/`): `npx tsc --noEmit`
Expected: no new errors involving `printify.ts`.

- [ ] **Step 3: Run the full test suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS (all existing + Task 1/2 tests).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/lib/printify.ts
git commit -m "refactor: extract uploadBufferToPrintify with alpha-aware format selection"
```

---

### Task 4: Update the apparel branch in `publish-to-printify` route

**Files:**
- Modify: `apps/frontend/src/app/api/publish-to-printify/route.ts:1-96`

**Interfaces:**
- Consumes: `upscalePreservingAlpha`, `uploadBufferToPrintify` (Task 2, Task 3), `uploadImageToPrintify` (unchanged, Task 3), `crispUpscale`, `removeBackground`, `needsBackgroundRemoval` (unchanged, `@/lib/recraft`).

No automated test for this task (route-level, network-touching — see Global Constraints). Verified via `tsc`, `lint`, and manual live verification in Task 5.

- [ ] **Step 1: Update the printify import**

In `apps/frontend/src/app/api/publish-to-printify/route.ts`, replace:

```ts
import {
  uploadImageToPrintify,
  createPrintifyProduct,
  publishPrintifyProduct,
  getPrintifyMockupImages,
} from '@/lib/printify';
```

with:

```ts
import {
  uploadImageToPrintify,
  uploadBufferToPrintify,
  upscalePreservingAlpha,
  createPrintifyProduct,
  publishPrintifyProduct,
  getPrintifyMockupImages,
  type PrintifyImageUpload,
} from '@/lib/printify';
```

- [ ] **Step 2: Restructure the image pipeline**

Replace this block (currently lines 25-59):

```ts
    let printUrl = String(imageUrl);
    const isApparel = needsBackgroundRemoval(String(productCategory));

    if (isApparel) {
      // Remove background first on the original (~1024px) — upscaled images exceed Recraft's size limit.
      // A failure here means the Printify product would be created with the background still attached,
      // so this blocks the publish instead of silently continuing.
      try {
        printUrl = await removeBackground(printUrl);
      } catch (bgErr) {
        const message = bgErr instanceof Error ? bgErr.message : String(bgErr);
        console.error('publish-to-printify: removeBackground failed, blocking publish:', message);
        return NextResponse.json(
          { error: `Background removal failed: ${message}` },
          { status: 502 },
        );
      }
      // Then upscale the bg-removed image for print quality
      try {
        printUrl = await crispUpscale(printUrl);
      } catch (upscaleErr) {
        console.warn('crispUpscale failed, using current URL:', upscaleErr instanceof Error ? upscaleErr.message : upscaleErr);
      }
    } else {
      // Non-apparel (drinkware): upscale only — background is part of the design
      try {
        printUrl = await crispUpscale(printUrl);
      } catch (upscaleErr) {
        console.warn('crispUpscale failed, using original URL:', upscaleErr instanceof Error ? upscaleErr.message : upscaleErr);
      }
    }

    // 3. Upload to Printify image library
    const fileName = `${assetId}-print.png`;
    const uploaded = await uploadImageToPrintify(printUrl, fileName);
```

with:

```ts
    let printUrl = String(imageUrl);
    const isApparel = needsBackgroundRemoval(String(productCategory));
    const fileName = `${assetId}-print.png`;
    let uploaded: PrintifyImageUpload;

    if (isApparel) {
      // Remove background first on the original (~1024px) — upscaled images exceed Recraft's size limit.
      // A failure here means the Printify product would be created with the background still attached,
      // so this blocks the publish instead of silently continuing.
      try {
        printUrl = await removeBackground(printUrl);
      } catch (bgErr) {
        const message = bgErr instanceof Error ? bgErr.message : String(bgErr);
        console.error('publish-to-printify: removeBackground failed, blocking publish:', message);
        return NextResponse.json(
          { error: `Background removal failed: ${message}` },
          { status: 502 },
        );
      }

      // Upscale locally, not via Recraft's crispUpscale — crispUpscale unconditionally
      // flattens transparency to a solid white background before upscaling, which
      // destroys the transparency removeBackground just produced (confirmed via live
      // testing 2026-07-12: WEBP hasAlpha:true -> WEBP hasAlpha:false, 47% opaque white).
      // A failure here blocks the publish for the same reason removeBackground does:
      // a silent fallback would ship a defective or lower-resolution print file.
      try {
        const bgRemovedRes = await fetch(printUrl);
        if (!bgRemovedRes.ok) {
          throw new Error(`Failed to fetch background-removed image: ${bgRemovedRes.status}`);
        }
        const bgRemovedBuffer = Buffer.from(await bgRemovedRes.arrayBuffer());
        const upscaledBuffer = await upscalePreservingAlpha(bgRemovedBuffer);
        uploaded = await uploadBufferToPrintify(upscaledBuffer, fileName);
      } catch (upscaleErr) {
        const message = upscaleErr instanceof Error ? upscaleErr.message : String(upscaleErr);
        console.error('publish-to-printify: upscale/upload failed, blocking publish:', message);
        return NextResponse.json(
          { error: `Image upscale failed: ${message}` },
          { status: 502 },
        );
      }
    } else {
      // Non-apparel (drinkware): upscale only — background is part of the design,
      // no transparency required, so Recraft's crispUpscale remains correct here.
      try {
        printUrl = await crispUpscale(printUrl);
      } catch (upscaleErr) {
        console.warn('crispUpscale failed, using original URL:', upscaleErr instanceof Error ? upscaleErr.message : upscaleErr);
      }
      uploaded = await uploadImageToPrintify(printUrl, fileName);
    }
```

- [ ] **Step 3: Type-check**

Run (from `apps/frontend/`): `npx tsc --noEmit`
Expected: no errors. (This will catch it if `uploaded` is used anywhere below with a mismatched shape — it shouldn't be, since `PrintifyImageUpload` is unchanged.)

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new problems beyond the pre-existing baseline (confirm current baseline count first with `npm run lint` on `main` before this change if unsure).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/api/publish-to-printify/route.ts
git commit -m "fix: replace crispUpscale with local alpha-preserving upscale for apparel"
```

---

### Task 5: Manual live verification (run directly in-session, do not delegate to a subagent)

This task touches real Printify/Firestore production data. Per this project's established practice, execute it step-by-step in the primary session with the user watching, not via an autonomous subagent.

**Files:** none (verification only).

- [ ] **Step 1: Confirm dev server is running**

From `apps/frontend/`: `npm run dev` (skip if already running on port 3000).

- [ ] **Step 2: Re-publish the previously-reverted asset**

Asset `bhS1XfyMYmMKPZJ3qZcF` ("Espresso Yourself Typography") currently points at its original, pre-defect Printify product (`6a46c68bfd17053d220ae3f8`) — reverted in the prior session. Use it as the test case, since its `imageUrl` (pre-background-removal) is already known good.

Call the route directly to observe the new pipeline (replace `<imageUrl>` with the asset's current `imageUrl` field, read via the Firestore console or a one-off read-only script following this repo's established `node --env-file=.env.local <script>.mjs` pattern — write it in `apps/frontend/`, run once, delete immediately, never commit):

```bash
curl -s -X POST http://localhost:3000/api/publish-to-printify \
  -H "Content-Type: application/json" \
  -d '{"assetId":"bhS1XfyMYmMKPZJ3qZcF","imageUrl":"<imageUrl>","title":"Espresso Yourself Typography","productCategory":"shirt"}'
```

Expected: JSON response with `"success": true` and a new `printifyProductId`.

- [ ] **Step 3: Verify the resulting mockup visually**

Fetch the new product's mockup (via `getPrintifyMockupImages` output in the response, or the Printify dashboard) and confirm there is no white box behind the design — the background should be genuinely transparent, showing the black shirt fabric.

- [ ] **Step 4: Clean up the test product**

If Step 3 confirms success, this created a second duplicate product for this asset (same situation as the prior session's interrupted cleanup). Decide with the user whether to: (a) swap Firestore's `printifyProductId` to this new corrected product and delete the old one, or (b) delete this test product and leave the asset as-is until the batch remediation (Tasks 3-5 of `docs/superpowers/plans/2026-07-11-background-removal-remediation-plan.md`) runs for all 5 assets together. Do not delete anything without explicit confirmation.

- [ ] **Step 5: Report result to the user**

State plainly whether the white-box defect is gone, and hand off to the paused remediation plan for the remaining 4 assets once confirmed.
