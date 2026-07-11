# Background-Removal Reliability Fix — Design

**Date:** 2026-07-11
**Status:** Approved for implementation

## Problem

Apparel products have shipped to Printify with their generated-image background still attached, showing as a visible box/patch on the finished print (especially noticeable on black t-shirts). Traced to two related gaps:

1. **`src/app/api/publish-to-printify/route.ts`** — when `removeBackground` throws (network blip, Recraft API error, etc.), the catch block only `console.warn`s and falls through, uploading the un-removed image to Printify. The publish "succeeds" with a defective print file and no visible signal to the admin.
2. **`src/app/api/n8n/create-asset/route.ts`** — `needsBackgroundRemoval(productCategory)` is called with no fallback when `productCategory` is empty (common for n8n-sourced assets, per this project's own documented n8n category-routing bug), so it silently evaluates to `false` and skips background removal on the generated preview image entirely.

Confirmed via a live diagnostic this session: 3 already-live products with `source: 'n8n'` and no `productCategory` set were found showing this defect on `/shop`, and archived as part of an unrelated reconciliation feature.

**Distinction that shapes scope:** `publish-to-printify` independently re-runs `removeBackground` on a copy of the image at publish time — it does not depend on whatever happened at generation time. So gap 1 is what actually determines print correctness; gap 2 only affects the cosmetics of the stored preview image used in gallery/studio, not what gets printed.

## Scope

- **In scope:** block-on-failure behavior for `publish-to-printify`'s background-removal step; a fallback default category for `n8n/create-asset`'s background-removal gate; a shared constant for the `'shirt'` default, replacing three independent hardcoded occurrences.
- **Out of scope:** auditing/remediating already-live products with this defect (separate sub-project — this fix only prevents recurrence going forward).
- **Out of scope:** fixing the n8n workflow's broken product-type routing itself (external, in the n8n dashboard, not this codebase — separate sub-project, different tooling).
- **Out of scope:** new automated test infrastructure. This repo's established convention (used by the two most recent Printify-related features) is Vitest for pure logic only, with routes verified manually via `tsc --noEmit` + live checks — there is no Firestore/external-API mocking infra here, and introducing one is a larger scope than this fix warrants.

## Decisions

- **Block the publish on `removeBackground` failure, not a silent fallback or a flag-and-continue** — a defective print file reaching Printify is the actual customer-facing harm; failing loudly lets the admin retry immediately via the existing `admin/assets` UI, which already surfaces per-row errors.
- **Default the n8n generation-time category to `'shirt'`, matching `publish-to-printify`'s existing (undocumented) convention** — correct for the common case; worst case for a miscategorized non-apparel item is one harmless extra Recraft API call, not a defect.
- **Extract a shared `DEFAULT_PRODUCT_CATEGORY` constant** rather than leaving three independent hardcoded `'shirt'` strings (one already existing in `admin/assets/page.tsx`, one new in `n8n/create-asset/route.ts`) — this exact kind of drift (one call site correctly defaulting, another silently not) is what caused gap 2 in the first place.
- **No new UI** — the block-on-failure error surfaces through `admin/assets/page.tsx`'s existing `rowErrors` state and inline error display; `publishToPrintify`'s catch block already renders `data.error` per-row.

## Changes

**`src/lib/recraft.ts`** — add, near `needsBackgroundRemoval`:
```ts
export const DEFAULT_PRODUCT_CATEGORY = 'shirt';
```

**`src/app/api/publish-to-printify/route.ts`** — replace the `removeBackground` catch block (currently logs a warning and continues with `printUrl` unchanged) with a `return NextResponse.json({ error: ... }, { status: 502 })`, matching this route's existing error-response shape for other failure branches.

**`src/app/api/n8n/create-asset/route.ts`** — change:
```ts
const removeBg = needsBackgroundRemoval(productCategory);
```
to:
```ts
const removeBg = needsBackgroundRemoval(productCategory || DEFAULT_PRODUCT_CATEGORY);
```
(import `DEFAULT_PRODUCT_CATEGORY` from `@/lib/recraft` alongside the existing `recraftGenerate`/`removeBackground`/`needsBackgroundRemoval` import.)

**`src/app/admin/assets/page.tsx`** — in `publishToPrintify`, replace the existing:
```ts
productCategory: asset.productCategory ?? 'shirt',
```
with:
```ts
productCategory: asset.productCategory ?? DEFAULT_PRODUCT_CATEGORY,
```
(new import of `DEFAULT_PRODUCT_CATEGORY` from `@/lib/recraft`.)

## Error Handling

- `publish-to-printify`: background-removal failure now returns `502` with an error message, instead of succeeding with a defective image. This is a new failure mode for an existing route — the admin UI already handles arbitrary non-`ok` responses from this route generically (`if (!res.ok) throw new Error(data.error ?? 'Publish failed')`), so no client-side change is needed beyond the category-default line above.
- `n8n/create-asset`: no new error path — the fallback just changes which branch (`removeBg` true/false) executes; existing error handling for `removeBackground` failures in that route (log-and-continue with the original image) is unchanged by this fix, since blocking asset *generation* on a transient bg-removal failure would be a worse tradeoff than blocking a *publish* (generation is a batch/queue operation via n8n; publish is a single deliberate admin action).

## Testing

- `npx tsc --noEmit` across all four changed files.
- `npm run lint` — confirm baseline unchanged (21 problems: 12 errors, 9 warnings, all pre-existing).
- Manual verification: trigger a publish with a temporarily-broken `removeBackground` (e.g. invalid Recraft credentials) and confirm the route returns `502` and the admin UI shows the inline error instead of creating a Printify product.
