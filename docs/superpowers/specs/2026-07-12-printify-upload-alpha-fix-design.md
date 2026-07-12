# Printify Upload Alpha-Preservation Fix — Design

**Date:** 2026-07-12
**Status:** Approved for implementation

## Problem

Five live Printify products show an unremoved white box behind the design on black t-shirt mockups. The prior remediation attempt (2026-07-11 session) assumed the defect was in `uploadImageToPrintify`'s unconditional JPEG conversion (`src/lib/printify.ts`, `sharp(...).jpeg({quality:80})`, no alpha channel). That conversion is real, but live testing this session proved it is not the active cause — by the time it runs, the image has already lost its alpha channel one step earlier.

**Confirmed root cause** (live test against the real Recraft API, using asset `OjADemKuWemWqRddphsy`):

| Step | Output |
| --- | --- |
| `removeBackground` | WEBP, 1024×1024, `hasAlpha: true`, 43.7% transparent |
| `crispUpscale` | WEBP, 4096×4096, `hasAlpha: false`, 47.2% opaque **white** |

`crispUpscale` (Recraft's upscaling endpoint) unconditionally flattens transparency to a solid white background before upscaling. In `src/app/api/publish-to-printify/route.ts`, apparel products call `removeBackground` then immediately `crispUpscale` — destroying the transparency `removeBackground` just created, before `uploadImageToPrintify` ever runs. `uploadImageToPrintify`'s JPEG conversion is a secondary, currently-redundant issue: the alpha is already gone by the time it executes.

This also resolves an open question from the prior session: isolated testing of the JPEG step alone showed transparent pixels flattening to **black** (`sharp`'s default flatten color), which didn't match the live **white** defect. The live pipeline never reaches that step with alpha intact — `crispUpscale`'s white flatten is what actually ships.

Printify's `/uploads/images.json` was independently verified (live test, synthetic PNG) to accept PNG uploads with alpha for this account (`mime_type: "image/png"` confirmed in response).

## Scope

- **In scope:** the apparel branch of `publish-to-printify`'s image pipeline (background removal → upscale → upload); making `uploadImageToPrintify`'s upload format alpha-aware for all callers.
- **Out of scope:** the drinkware (mug/cup) branch — it doesn't need transparency and its current `crispUpscale` usage is not defective; changing it would be unrelated scope creep.
- **Out of scope:** the redundant second `removeBackground` call that runs on n8n-created apparel assets (which already had background removed at generation time). Noted as a real inefficiency, not the defect being fixed here.
- **Out of scope:** remediating the 5 already-defective live products — that's the paused plan (`docs/superpowers/plans/2026-07-11-background-removal-remediation-plan.md`, Tasks 3–5), resumed only after this fix is verified on one asset.
- **Out of scope:** new fetch/external-API mocking test infrastructure, per this repo's established convention (see `2026-07-11-background-removal-reliability-design.md`) — Vitest covers pure logic only; routes are verified manually.

## Decisions

- **Replace `crispUpscale` with a local `sharp` resize for the apparel branch only, not for all categories** — the defect is specific to apparel's transparency requirement. Drinkware's use of `crispUpscale` is unaffected and out of scope; changing it would touch working code for no benefit (rejected as "Approach C" during design).
- **Local resize over dropping upscaling entirely** — apparel designs in this pipeline are vector/flat-illustration style (`vector_illustration`/`digital_illustration` styles in `recraft.ts`), not photographic, so a Lanczos3 resize is visually close to what an AI upscaler would have produced and fully preserves alpha with no external API dependency (also sidesteps the `crispUpscale` 401 flakiness observed this session, for this branch).
- **Match the existing 4096×4096 target** — preserves current print resolution expectations; no regression from today's (nominal, pre-defect) apparel print quality.
- **Make `uploadImageToPrintify` alpha-aware for every caller, not just the new apparel path** — a shared, format-detecting upload function means any future caller (or a future pipeline change) can't silently reintroduce this defect by accident. Drinkware's behavior is unchanged in practice (its input never has alpha), but the function is now correct by construction rather than by the coincidence of what currently produces it.
- **Extract the PNG-vs-JPEG decision into a small pure function** — keeps the format-selection logic unit-testable with real `sharp` buffers, consistent with this repo's no-mocking-infra convention, rather than requiring a `fetch` mock to exercise it.

## Changes

**`src/lib/printify.ts`:**

1. New pure helper:
   ```ts
   export function pickUploadFormat(hasAlpha: boolean): 'png' | 'jpeg' {
     return hasAlpha ? 'png' : 'jpeg';
   }
   ```

2. New:
   ```ts
   export async function upscalePreservingAlpha(buffer: Buffer, targetSize = 4096): Promise<Buffer> {
     return sharp(buffer)
       .resize(targetSize, targetSize, { fit: 'inside', kernel: 'lanczos3' })
       .png()
       .toBuffer();
   }
   ```

3. New:
   ```ts
   export async function uploadBufferToPrintify(buffer: Buffer, fileName: string): Promise<PrintifyImageUpload> {
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
   ```

4. `uploadImageToPrintify(imageUrl, fileName)` (existing, used by the drinkware branch): keep the fetch-by-URL step, then delegate encoding/upload to `uploadBufferToPrintify` instead of duplicating the JPEG-only logic inline.

**`src/app/api/publish-to-printify/route.ts`** — apparel branch (`isApparel === true`):

Replace:
```ts
printUrl = await removeBackground(printUrl);
// ...
printUrl = await crispUpscale(printUrl);
// ...
const uploaded = await uploadImageToPrintify(printUrl, fileName);
```
with (apparel-only path):
```ts
printUrl = await removeBackground(printUrl); // unchanged, still blocks on failure per 2026-07-11 fix
const bgRemovedRes = await fetch(printUrl);
const bgRemovedBuffer = Buffer.from(await bgRemovedRes.arrayBuffer());
const upscaled = await upscalePreservingAlpha(bgRemovedBuffer);
const uploaded = await uploadBufferToPrintify(upscaled, fileName);
```
The non-apparel (drinkware) branch is unchanged: `crispUpscale(printUrl)` → `uploadImageToPrintify(printUrl, fileName)`.

## Error Handling

- `upscalePreservingAlpha` failure blocks the publish (return `502`, same pattern as the existing `removeBackground` block-on-failure from the 2026-07-11 fix) rather than silently falling back to the un-upscaled image — a silent fallback would ship a lower-resolution product without any signal, same reasoning as why `removeBackground` failures are already blocking.
- `uploadBufferToPrintify`'s Printify POST failure behaves exactly like today's `uploadImageToPrintify` failure: throws, caught by the route's top-level `catch`, returns `500`. No new failure mode introduced here.
- Drinkware branch: no error-handling changes.

## Testing

Consistent with this repo's established convention (Vitest for pure logic, no external-API mocking):

- `pickUploadFormat`: unit test both branches (`true` → `'png'`, `false` → `'jpeg'`).
- `upscalePreservingAlpha`: unit test with a real, synthetic `sharp`-generated transparent buffer (small, in-memory, not a fixture file) — assert output `hasAlpha: true` and dimensions match `targetSize`.
- `uploadBufferToPrintify` / route-level apparel flow: **not** unit-tested with mocks, per convention. Verified via:
  - `npx tsc --noEmit` across all changed files.
  - `npm run lint` — confirm no new problems beyond the existing baseline.
  - Manual live verification: publish one real apparel asset end-to-end (the same staged-rollout pattern used in the prior remediation attempt — one asset first, confirm the resulting Printify mockup has no white box, before touching the other 4 known-defective assets).
