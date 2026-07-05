# Printify → Firestore Import/Sync — Design

**Date:** 2026-07-05
**Status:** Approved for implementation

## Problem

Printify's own dashboard shows 15 published products for this shop. Firestore's `assets` collection — the only source `/shop` reads from — only has `printifyProductId` set on 8 of them. The other 7 distinct products (plus 4 duplicate "AI generated design" shirts, 11 unmatched total) were created directly in Printify's UI, outside the app's generate → publish pipeline entirely, and can never appear on `/shop` no matter what mockup-display logic exists there. This was discovered while diagnosing why the shipped mockup-cycling feature (`/shop` grid) looked inert in testing — that feature is correct; the gap is one layer deeper, in product coverage.

Ground-truth audit (read-only, this session):

| Untracked product | blueprint_id | mockup images on Printify |
|---|---|---|
| Kiss-Cut Stickers | 400 | 12 |
| Cotton Canvas Tote Bag | 1313 | 2 |
| Unisex Heavy Blend Hooded Sweatshirt | 77 | 2 |
| Unisex Garment-Dyed T-shirt | 706 | 2 |
| 4× "AI generated design" (duplicate shirts, blueprint 12 — same as tracked shirts) | 12 | 1 each (one has 4) |

None of blueprints 706/77/400/1313 match the app's configured `BLUEPRINT_IDS` map in `src/lib/printify.ts` (shirt=12/99, hoodie=92/99, tote=553/217, mug=68/1, cup=425/1).

## Scope

- **In scope:** a manual admin-triggered import flow that surfaces Printify products with no matching Firestore doc, lets an admin assign a category and confirm each one individually, and writes approved ones into the existing `assets` collection so they immediately appear on `/shop`.
- **In scope:** two small bug fixes in `admin/assets/page.tsx` discovered during this session's diagnostics, bundled in since this feature touches the same file (see "Bundled Bug Fixes" below).
- **In scope:** excluding imported products from `/gallery`, which is built around AI-generated assets (expects a `prompt` field for remixing) and has no filter today that would otherwise catch these.
- **Out of scope:** automatic/scheduled sync, Printify webhooks — rejected in favor of a manual review-first flow (see Decisions).
- **Out of scope:** re-publishing, editing, or deleting products on Printify itself — this feature only reads from Printify and writes to Firestore, one direction.
- **Out of scope:** automatic duplicate detection/merging of the 4 "AI generated design" shirts — surfaced for manual per-row review/ignore instead, not auto-matched.

## Decisions

- **Manual admin button, not scheduled/webhook sync** — this is a low-frequency, high-consequence action (it decides what appears for sale); a human should review new products before they go live, and there's no infrastructure cost of a cron/webhook to maintain.
- **Categorize new blueprints as needed rather than force-fitting into the existing 5** — Kiss-Cut Stickers isn't conceptually a shirt/hoodie/tote/mug/cup. The category taxonomy grows; each imported product also keeps its own real `printifyBlueprintId`/`printifyPrintProviderId` since they no longer map 1:1 from category via the app's single default-blueprint table.
- **No auto-match/hide for likely duplicates** — the 4 duplicate shirts are shown as ordinary rows in the review table; the admin decides Import or Ignore per row, same as any other unmatched product.
- **Same `assets` collection, not a new one** — `/shop`'s existing query (`printifyStatus in ['published', 'created']`) already covers imported docs with zero changes to `/shop`, `ProductTileImage`, or the product detail page. Imported docs simply omit `imageUrl`/`prompt`/`niche`/`style`, which `/shop` already tolerates (`mockupUrl ?? imageUrl ?? null`).
- **Exclude imports from Gallery** — tag with `importSource: 'printify-import'` and filter it out client-side, since Gallery's remix flow has no meaning for a product with no `prompt`.
- **Bundle the two admin/assets.tsx bug fixes** — both are small, well-understood, and in the file this feature already modifies.

## Data Model Changes

**`Asset` (`src/lib/types.ts`) — new optional fields:**

```ts
printifyBlueprintId?: number;       // the actual blueprint this product uses on Printify
printifyPrintProviderId?: number;   // the actual print provider this product uses on Printify
importSource?: 'printify-import';   // set only on imported docs; absent on app-generated ones
```

`printifyBlueprintId`/`printifyPrintProviderId` are metadata only — nothing re-publishes an already-published product, so these aren't consumed by any live code path yet. They exist so an imported product's real blueprint is recorded rather than silently assumed to match the app's category defaults.

**New Firestore collection: `printifyImportIgnores`**
Doc ID = Printify product ID. Body: `{ title: string, ignoredAt: Timestamp }`. Persists "ignore" decisions (e.g. the 4 duplicate shirts) across repeated scans without touching `assets`.

**Category suggestion table** (new, in `src/lib/printify.ts`): a blueprint-id → category reverse lookup, seeded with this session's audit (400→sticker, 1313→tote, 77→hoodie, 706→shirt) plus the existing 5 default blueprints. Any blueprint not in the table suggests no category — the admin UI requires an explicit pick before that row's Import button is enabled.

## API Routes

All three are server-only (`runtime = 'nodejs'`), following the existing `refresh-mockup/route.ts` pattern (adminDb + Printify API key, no auth gate — consistent with the rest of `/admin/*` today).

**`GET /api/printify-import/preview`**
1. Fetch all products from `GET /shops/{shopId}/products.json`, paginating until exhausted (hard cap of 50 pages as a runaway-loop guard against a malformed `last_page`).
2. Query `assets` for all docs with `printifyProductId` set → tracked-ID set.
3. Query all `printifyImportIgnores` docs → ignored-ID set.
4. Filter Printify products to those in neither set.
5. For each, attach a suggested category from the lookup table and the product's mockup images (same shape `getPrintifyMockupImages` already produces — reuse that mapping).
6. Return `{ products: PreviewItem[] }`. Any Printify fetch failure returns a single page-level error — no partial results.

**`POST /api/printify-import/commit`**
Body: `{ printifyProductId, title, category, blueprintId, printProviderId, mockupImages }`. Validates `category` is non-empty (400 if missing — no silent default). Writes a new `assets` doc:

```ts
{
  title,
  productCategory: category,        // camelCase — matches Asset.productCategory and publish-to-printify's write convention
  printifyProductId,
  printifyStatus: 'published',      // already published on Printify; satisfies /shop's query filter
  printifyBlueprintId: blueprintId,
  printifyPrintProviderId: printProviderId,
  mockupImages,
  mockupUrl: mockupImages.find(i => i.isDefault)?.src ?? mockupImages[0]?.src ?? null,
  importSource: 'printify-import',
  createdAt: FieldValue.serverTimestamp(),
}
```

**`POST /api/printify-import/ignore`**
Body: `{ printifyProductId, title }` → writes one doc to `printifyImportIgnores`. No Printify call.

## Admin UI

**New page:** `src/app/admin/printify-import/page.tsx` (client component), linked from a new button on `admin/assets/page.tsx`'s header.

- "Scan Printify" button (not auto-fetch on mount) calls the preview route and renders a table: thumbnail (first mockup image), title, Printify blueprint ID, an editable category `<select>` (5 existing categories + `sticker`, pre-filled with the suggestion or blank), Import button, Ignore button.
- **Import** is disabled until a category is selected for that row. On click: `POST /api/printify-import/commit`; row is removed on success, shows an inline error on failure (other rows unaffected, item stays for retry).
- **Ignore**: awaits `POST /api/printify-import/ignore` the same way as Import (not optimistic, for consistency) — row removed only on success, inline error and row retained on failure.
- Duplicate shirts get no special-cased UI — ordinary rows in the same table.
- Empty state: "No new Printify products found" once a scan completes with zero results.

A separate page (rather than embedding in `admin/assets/page.tsx`, currently 316 lines) keeps that file from growing further and keeps this review flow's independent loading/error state from interleaving with the existing assets table's state.

## Bundled Bug Fixes (`admin/assets/page.tsx`)

1. `backfillAllMockups`'s filter (line ~104) checks `!a.mockupUrl`, which is `false` for every currently-tracked asset (all 8 already have a `mockupUrl`), making the "Backfill All" button a silent no-op. Fix: filter on `!a.mockupImages?.length`, matching the field the button's own `disabled` condition already checks.
2. `refreshMockup`'s success handler (lines ~88-92) and `backfillAllMockups`'s per-item update (lines ~117-119) both merge only `mockupUrl` into local state, even though the API response already includes `mockupImages`. Fix: merge `mockupImages` into state in both places.

## Gallery Exclusion

`gallery/page.tsx` queries all `assets` (ordered by `createdAt`, limit 200) with no `published`/source filter today, and renders a "Remix Prompt" action that expects a `prompt` field. Add a client-side filter excluding docs where `importSource === 'printify-import'`, so imported physical products don't show up as broken/non-functional Gallery cards.

## Error Handling

- Preview: bounded pagination loop; any Printify fetch failure surfaces one page-level error, no partial table rendered.
- Commit/Ignore: 400 on missing required fields (category, productId); 500 on Firestore/Printify failures; both surface as that row's inline error with the row retained for retry.

## Testing (80%+ coverage target)

- Unit: blueprint→category suggestion lookup, including the unknown-blueprint → no-suggestion case.
- Integration: `preview` route — tracked assets excluded, ignored products excluded, multi-page pagination handled, correct category suggestions attached.
- Integration: `commit` route — correct `assets` doc shape written; rejects missing/empty category.
- Integration: `ignore` route — writes the expected `printifyImportIgnores` doc.
- Regression: `backfillAllMockups` filter fix, `refreshMockup`/backfill state-merge fix.
- E2E (Playwright): scan → select category → Import removes the row; scan → Ignore removes the row and it doesn't reappear on a second (mocked) scan.
