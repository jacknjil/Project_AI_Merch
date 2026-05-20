# Sprint 6A Design: Asset Published Filter

**Date:** 2026-05-20
**Status:** Approved
**Scope:** Admin toggle to publish/unpublish assets, client-side gallery filter so only published assets are visible to customers.

---

## Overview

n8n generates assets automatically. Without a curation gate, every generated asset appears in the customer gallery immediately. This sprint adds a `published` boolean field to assets and a toggle-only admin UI at `/admin/assets` so operators can hide assets that shouldn't be customer-facing.

**Out of scope:** Asset create/edit/delete (n8n owns asset creation). Firestore-side query filter (client-side filter chosen for simplicity at current scale).

---

## Data Layer

### `src/lib/types.ts`

Add `published?: boolean` to the `Asset` interface:

```ts
export interface Asset {
  id: string;
  title: string;
  niche?: string;
  imageUrl: string;
  thumbUrl?: string;
  prompt?: string;
  source?: string;
  createdAt?: number;
  published?: boolean; // undefined = treated as published (default)
}
```

### `src/hooks/useAssets.ts`

**Fetch change:** replace `limit(count)` with `limit(count * 2)` to give the client-side filter headroom.

**Filter:** after mapping docs to `Asset[]`, filter `a.published !== false`. This treats `true` and `undefined` (missing field) as published, and `false` as hidden.

**Slice:** after filtering, take the first `count` results so the gallery still shows at most `count` assets.

No change to `getAsset` — single-doc fetch by ID is unaffected by published state (compose page needs to load any asset by ID).

### Firestore

No new indexes required. The gallery query remains `orderBy('createdAt', 'desc')`. The published filter is purely client-side.

New assets from n8n have no `published` field — they appear in the gallery automatically (desired default behavior).

---

## Gallery

`src/app/studio/gallery/page.tsx` — **no changes.** The hook change is transparent to the page.

---

## Admin Assets Page

### Route

`/admin/assets` — new file `src/app/admin/assets/page.tsx`.

### Behavior

- Fetches **all** assets directly from Firestore (`orderBy('createdAt', 'desc')`, no limit, no published filter) — admin needs to see everything including hidden assets.
- Renders a scrollable list. Each row:
  - Square thumbnail (64×64, object-cover)
  - Title + niche badge
  - Published status chip (green "Published" / gray "Hidden")
  - Toggle button: "Hide" when published, "Publish" when hidden
- **Toggle flow:**
  1. Optimistic update: flip `published` in local state immediately
  2. `updateDoc(doc(db, 'assets', id), { published: !current })`
  3. On error: revert local state, show inline error on that row
- Loading state: "Loading assets…" pulse text
- Empty state: "No assets found."
- Error state: red error message

### Admin Nav

There is no shared admin nav component — each page has its own header. Two specific changes:

1. **`/admin/products/page.tsx`** — add an "Assets →" link in the page header, next to the existing "+ New product" button.
2. **`/admin/assets/page.tsx`** — add a "← Products" link in its own header, linking back to `/admin/products`.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Firestore toggle write fails | Revert optimistic update, show inline error on that row |
| Asset image fails to load in admin | Show "No image" placeholder (same pattern as admin/products) |
| All assets unpublished | Gallery shows empty state: "No art yet — be the first to generate!" |

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/types.ts` | Add `published?: boolean` to Asset |
| `src/hooks/useAssets.ts` | `limit(count * 2)`, client-side filter, slice |
| `src/app/admin/assets/page.tsx` | New — asset list with publish toggle |
