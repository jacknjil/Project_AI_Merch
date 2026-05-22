# Sprint 7 — Niche & Style Filtering for Gallery and Shop

**Date:** 2026-05-21  
**Status:** Approved

## Overview

Add clickable pill-chip filters for `niche` and `style` to the gallery (`/gallery`) and shop (`/shop`) pages. Filtering is client-side, single-select per dimension, using local React state. A shared `FilterBar` component is extracted for reuse across both pages.

---

## 1. Data Changes

### Assets (Firestore `assets` collection)

No Firestore writes needed. The `style` field is already saved by the `/api/n8n/create-asset` route (mapped from the n8n Google Sheet's `styleTag` column). The `niche` field is also already stored.

Frontend changes only:

- Add `style?: string` to the `Asset` interface in `src/lib/types.ts`.
- Map `style` from each Firestore doc in the gallery page fetch.

### Products (Firestore `products` collection)

Add two new optional fields:

- `niche?: string` — free-text, e.g. `"gaming"`, `"fitness"`
- `style?: string` — free-text, e.g. `"Retro Synthwave"`, `"Minimalist Line Art"`

Written via the admin product forms. Read by the shop page for filtering. No Firestore index needed (all filtering is in-memory).

`src/lib/types.ts` — add both fields to the `Product` interface.

---

## 2. FilterBar Component

**File:** `src/components/FilterBar.tsx`

### Props

```ts
type FilterDimension = {
  key: 'niche' | 'style';
  label: string; // display label for the row, e.g. "Niche" or "Style"
  values: string[]; // sorted unique values derived from loaded data
};

type FilterBarProps = {
  filters: FilterDimension[];
  active: Record<'niche' | 'style', string | null>;
  onChange: (key: 'niche' | 'style', value: string | null) => void;
};
```

### Behavior

- Renders one row of pill chips per `FilterDimension`.
- Clicking an inactive pill sets it as the active filter for that dimension.
- Clicking the currently active pill clears it (sets to `null`).
- Each dimension is independent — clearing niche does not affect style.
- Only renders a dimension row if `values.length > 0`.
- Uses inline styles consistent with the dark theme (`background: '#020617'`, etc.) matching the existing gallery and shop pages.

### Active pill style

Inactive: subtle border (`#4b5563`), dark background (`#1f2937`), muted text (`#9ca3af`).  
Active: cyan-tinted border (`#06b6d4`), tinted background (`#0c2a31`), bright text (`#a5f3fc`).

---

## 3. Gallery Page (`/gallery`)

**File:** `src/app/gallery/page.tsx`

### Changes

1. Add `style` to the local `Asset` type and map from Firestore doc.
2. Add `activeNiche: string | null` and `activeStyle: string | null` state.
3. Compute `niches` and `styles` via `useMemo` over loaded assets (sorted, deduped).
4. Compute `filtered` via `useMemo`: start with all assets, filter by `activeNiche` if set, then by `activeStyle` if set.
5. Replace the existing non-interactive niche pill `<div>` with `<FilterBar>`.
6. Render `filtered` instead of `assets` in the grid.

---

## 4. Shop Page (`/shop`)

**File:** `src/app/shop/page.tsx`

### Change 2

1. Add `niche?: string` and `style?: string` to local `ProductDoc` type and map from Firestore doc.
2. Add `activeNiche: string | null` and `activeStyle: string | null` state.
3. Compute `niches` and `styles` via `useMemo` over loaded products.
4. Compute `filtered` via `useMemo`: same logic as gallery.
5. Add `<FilterBar>` above the product grid. Only rendered when at least one dimension has values.
6. Render `filtered` instead of `products` in the grid.

No changes to the Firestore query.

---

## 5. Admin Product Forms

**Files:**

- `src/app/admin/products/new/page.tsx`
- `src/app/admin/products/[productId]/page.tsx`

### Change 3

1. Add `niche` and `style` state fields (free-text string, default empty).
2. Add `<input type="text">` for each field with labels "Niche (optional)" and "Style tag (optional)".
3. Helper text: "Used for gallery and shop filtering."
4. Include both in the Firestore write payload on create/update.
5. On the edit page, read and pre-populate both fields from the fetched product doc.

Both fields are optional. No validation.

---

## Out of Scope

- URL query params for shareable filter state (deferred to a later sprint)
- Server-side Firestore filtering / composite indexes
- Multi-select filtering
- Filtering on `/products` page (not in scope this sprint)
