# Printify Deletion → Firestore Reconciliation — Design

**Date:** 2026-07-11
**Status:** Approved for implementation

## Problem

When a product is deleted directly in Printify's own dashboard, the Firestore `assets` doc backing it is never cleaned up, so it keeps appearing on `/shop`. `/shop` (`apps/frontend/src/app/shop/page.tsx`) queries only Firestore — `where('printifyStatus', 'in', ['published', 'created'])`, ordered by `createdAt desc` — and never checks live Printify state at render time. Today only a one-way sync exists (Printify → Firestore, for products that exist on Printify but are missing from Firestore, see `2026-07-05-printify-import-sync-design.md`); nothing handles the reverse direction.

## Scope

- **In scope:** a manual admin-triggered scan that finds `assets` docs whose `printifyProductId` no longer resolves on live Printify, surfaces them in a review table, and lets an admin archive them individually.
- **In scope:** a Restore action for reversing a mistaken archive.
- **In scope:** a bundled fix to `admin/assets/page.tsx` — see Bundled Bug Fix below — required for the archive/restore states to render safely.
- **Out of scope:** automatic/scheduled sync or Printify webhooks — same reasoning already established for the import direction: this is a low-frequency, high-consequence action (it removes live storefront listings), so a human should review before anything is removed. Deletion is at least as consequential as import, so the precedent applies at least as strongly.
- **Out of scope:** hard-delete. Soft-archive was chosen — see Decisions.
- **Out of scope:** duplicate-product detection/cleanup on Printify's side (a separate, unrelated issue noted in a prior session — 4 orphaned duplicate shirts with no Firestore doc at all, which this feature's comparison direction doesn't touch).

## Decisions

- **Manual admin button, not scheduled/webhook sync** — mirrors the import feature's precedent exactly, for the same reason: a human should review before removing anything from the storefront, and there's no infra to maintain.
- **Soft-archive, not hard-delete** — set `printifyStatus: 'archived'` (a new, currently-unused value — confirmed via repo-wide grep that only `'published'` is ever written today) rather than deleting the Firestore doc. This is automatically excluded from `/shop`'s query with zero changes needed there, and is reversible.
  - Verified this is safe from an orders-integrity standpoint regardless of archive-vs-delete: `create-checkout-session/route.ts` copies a fully denormalized item snapshot (title, image, price, size) into `checkout_sessions`/`orders` at checkout time. `assetId`/`productId` are stored as plain reference strings only — nothing re-queries `assets` to render order history (confirmed via grep: no `assets` references in `admin/orders` or `api/admin/orders`).
- **New page (`admin/printify-reconcile`), not bolted onto `admin/assets`** — same reasoning as the import feature's separate page: keeps `admin/assets/page.tsx` (already 319 lines) from growing further, and keeps this flow's independent loading/error state from interleaving with the existing assets table's state.
- **Restore lives on `admin/assets`, not the reconcile page** — the reconcile page is a one-shot scan/review view; `admin/assets` already lists every asset unfiltered, so it's the natural durable place to see and reverse an archived item.
- **Restore always targets `printifyStatus: 'published'`, not a stored "previous status"** — every doc eligible for archiving got its status from the import/publish flow, which only ever writes `'published'`. Storing and restoring a previous-status field would be unused generality.
- **No "ignore" list, unlike the import feature** — there's nothing to persist across scans. A row an admin chooses not to archive simply reappears on the next manual scan, which is acceptable since scans are infrequent and manual.

## Bundled Bug Fix (`admin/assets/page.tsx`)

Found while designing this feature, must ship with it: the existing conditional at ~line 277 renders a **"Publish to Printify" button** for any row where `printifyStatus !== 'published'`. `publishToPrintify` (line 41) always POSTs to `/api/publish-to-printify` to create a **new** Printify product — it has no check for an already-set `printifyProductId`. Without a guard, an archived row would fall into this branch, and clicking "Publish to Printify" would create a duplicate product on Printify instead of restoring the original. Fix: add an explicit `printifyStatus === 'archived'` branch (see Admin UI below) so archived rows never reach the Publish button.

## Data Model Changes

**`Asset` (`src/lib/types.ts`) — one new optional field:**

```ts
archivedAt?: Timestamp;   // set when reconciliation archives a doc; cleared (deleted) on restore
```

`printifyStatus` gains a new possible value, `'archived'`, alongside the existing `'published'`/`'created'` (the field is already typed as `string`, so no type change needed).

## Comparison Logic

Inverts the import direction's `fetchAllPrintifyProducts` + `filterUnmatchedProducts` (`src/lib/printify.ts`):

1. Fetch all `assets` docs (same unfiltered fetch pattern `admin/assets/page.tsx` already uses — collection is small). Keep those with a non-empty `printifyProductId` **and** `printifyStatus !== 'archived'` (already-archived docs must not resurface on every scan).
2. Fetch the live Printify product list via `fetchAllPrintifyProducts` (existing 50-page pagination cap reused as-is).
3. Build a `Set` of live Printify product IDs.
4. Flag any asset from step 1 whose `printifyProductId` is **not** in that set — these are the orphans returned by `preview`.

## API Routes

All server-only (`runtime = 'nodejs'`), following the same conventions as `printify-import`'s routes and the rest of `/admin/*` (no auth gate — consistent with existing admin routes).

**`GET /api/printify-reconcile/preview`**
Runs the comparison logic above. Returns `{ orphans: { id: string; title: string; printifyProductId: string; mockupUrl: string | null }[] }`. Any Printify fetch failure returns a single page-level error — no partial results.

**`POST /api/printify-reconcile/archive`**
Body: `{ assetId: string }`. Validates the doc exists (400 if missing/not found). Writes to `assets/{assetId}`:
```ts
{
  printifyStatus: 'archived',
  archivedAt: FieldValue.serverTimestamp(),
}
```

**`POST /api/printify-reconcile/restore`**
Body: `{ assetId: string }`. Validates the doc exists (400 if missing/not found). Writes to `assets/{assetId}`:
```ts
{
  printifyStatus: 'published',
  archivedAt: FieldValue.delete(),
}
```

## Admin UI

**New page: `src/app/admin/printify-reconcile/page.tsx`** (client component), linked from a new button on `admin/assets/page.tsx`'s header, next to the existing "Scan Printify" (import) button.

- "Scan for removed products" button (not auto-fetch on mount) calls `preview` and renders a table: thumbnail, title, Printify product ID, an "Archive" button per row.
- **Archive**: on click, `POST /api/printify-reconcile/archive`; row removed from the table on success, inline error shown on failure (row stays for retry) — same non-optimistic pattern as import's Import/Ignore buttons.
- Empty state: "No removed products found" once a scan completes with zero orphans.

**Change to `admin/assets/page.tsx`** (bundled fix + Restore action), replacing the block at ~line 277:

```tsx
{asset.printifyStatus === 'published' ? (
  <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">
    On Etsy
  </span>
) : asset.printifyStatus === 'archived' ? (
  <>
    <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-muted">
      Archived
    </span>
    <button
      onClick={() => restore(asset)}
      disabled={restoringId === asset.id}
      className="shrink-0 rounded-md border border-white/20 px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {restoringId === asset.id ? 'Restoring…' : 'Restore'}
    </button>
  </>
) : (
  <button
    onClick={() => publishToPrintify(asset)}
    disabled={publishingId === asset.id || !asset.imageUrl}
    className="shrink-0 rounded-md border border-violet-500/30 px-3 py-1 text-xs font-medium text-violet-400 transition-colors hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {publishingId === asset.id ? 'Publishing…' : 'Publish to Printify'}
  </button>
)}
```

`restore(asset)` is a new handler (new `restoringId` state, mirroring `publishingId`) that calls `POST /api/printify-reconcile/restore`, updates local state on success, and sets a row-level error on failure — same pattern `publishToPrintify` already uses in this file.

## Error Handling

- **Preview:** bounded pagination (existing 50-page cap in `fetchAllPrintifyProducts`); any Printify fetch failure → single page-level error, no partial table rendered.
- **Archive/Restore:** 400 on missing/invalid `assetId` or doc not found; 500 on Firestore write failure; both surface as that row's inline error, row retained for retry.

## Testing (80%+ coverage target)

- **Unit:** orphan-detection logic — asset with a matching live Printify ID excluded; asset with no `printifyProductId` excluded; already-archived asset excluded from re-flagging.
- **Integration:** `preview` route — multi-page pagination handled, correctly excludes tracked and already-archived docs, correct orphan shape returned.
- **Integration:** `archive` route — correct field writes (`printifyStatus`, `archivedAt`), rejects missing/nonexistent `assetId`.
- **Integration:** `restore` route — clears `archivedAt`, resets `printifyStatus` to `'published'`, rejects missing/nonexistent `assetId`.
- **Regression:** `admin/assets/page.tsx` Publish-button guard — archived rows must never render the "Publish to Printify" button, must render "Archived" badge + Restore instead.
- **E2E (Playwright):** scan → Archive removes the row from the reconcile table; archived asset shows "Archived" badge + Restore button on `admin/assets`; Restore flips status back to `'published'` and the row becomes eligible for `/shop` again.
