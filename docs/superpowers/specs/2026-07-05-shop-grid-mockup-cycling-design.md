# Shop Grid Mockup Cycling — Design

**Date:** 2026-07-05
**Status:** Approved for implementation

## Problem

`/shop/[productId]` (the product detail page) already shows every Printify mockup image for a product — a clickable thumbnail gallery driven by the `mockupImages[]` array stored on each `assets/{id}` Firestore doc (populated by `getPrintifyMockupImages()` / `PATCH /api/refresh-mockup`).

`/shop` (the grid) does not use this array at all. It only reads the single `mockupUrl ?? imageUrl` field, so every product tile shows one static image regardless of how many mockup angles Printify generated for it. The user rejected this as the final behavior and wants the grid tiles to reveal the multiple mockup angles too.

## Scope

- **In scope:** `/shop` grid tiles only (`apps/frontend/src/app/shop/page.tsx`).
- **Out of scope:** Homepage tiles (`FeaturedProducts.tsx`, `NewArrivals.tsx`) — confirmed via grep that these read `mockupImageUrl` from the separate `products` Firestore collection (single image per doc, no array), not `assets.mockupImages[]`. They are a different data model and not touched by this change.
- **Out of scope:** Changing anything on `/shop/[productId]` — its existing thumbnail gallery is unaffected.

## Data flow

`assets/{id}` docs already carry `mockupImages?: { src: string; label: string; isDefault: boolean }[]` (see `src/lib/types.ts:32`). `shop/page.tsx`'s Firestore query already fetches the full doc — it just needs to read one more field (`data.mockupImages`) alongside the existing `mockupUrl ?? imageUrl` fallback it computes today. No new Firestore query, no new Printify API calls.

## Component

New file: `apps/frontend/src/components/shop/ProductTileImage.tsx` (client component).

```ts
interface ProductTileImageProps {
  mockupImages?: { src: string; label: string; isDefault: boolean }[];
  fallbackSrc: string | null;
  alt: string;
}
```

`shop/page.tsx` renders `<ProductTileImage mockupImages={p.mockupImages} fallbackSrc={p.mockupImageUrl} alt={p.name} />` in place of the current inline `<Image>` block inside the grid card. The existing "View details" `<Link>` below the image is untouched.

## Behavior

**No `mockupImages`, or fewer than 2 entries:** render exactly what the grid does today — the single fallback image (or "No image yet" placeholder), no dots, no interaction. Zero behavior change for assets without mockup data.

**`mockupImages.length > 1`:**

| Trigger | Behavior |
|---|---|
| `onMouseEnter` (desktop) | Start a 1500ms `setInterval` advancing `activeIndex = (activeIndex + 1) % mockupImages.length`. Loops indefinitely while hovered. |
| `onMouseLeave` (desktop) | Clear the interval, reset `activeIndex` to 0 (the default/first image). |
| `onClick` on the image (touch) | Advance `activeIndex` by one (mod length). Does **not** navigate — confirmed the tile image has no existing click-to-navigate behavior; only the separate "View details" link navigates today, so this adds no regression. |
| Unmount | `useEffect` cleanup clears any active interval to avoid leaks if a shopper scrolls away mid-hover. |

**Dot row:** rendered only when `mockupImages.length > 1`. Small dot indicators centered at the bottom of the image, one per mockup image, active dot visually filled/highlighted. Same dot row on both desktop and touch — it's the affordance that tells touch users the image is tappable.

## Error handling

If an individual mockup image URL fails to load, it fails within its ~1.5s slot in the cycle the same way a broken single image fails today — no retry/backoff logic. `refresh-mockup` already validates URLs against Printify at write time, so a broken URL in `mockupImages[]` would be an existing data problem, not something this feature introduces.

## Testing

- Unit test for `ProductTileImage` (React Testing Library + fake timers): renders single fallback with no dots when `mockupImages` is absent/short; advances `activeIndex` on a fake-timer tick while hovered; advances on click; resets to index 0 on mouse-leave; clears interval on unmount.
- No new E2E test for this pass. Manual Playwright verification during implementation is the project's usual bar for presentation-only changes with no backend/data risk (per `CLAUDE.md` cost-discipline guidance and prior sprints' pattern).

## Explicitly deferred (noted for future revision, not blocking this pass)

The user asked that any implementation-time recommendations be logged here for later, rather than expanding scope now:

- Preloading/priority strategy for the non-default mockup images (currently: rely on `next/image` default lazy behavior; revisit if grid scroll performance becomes an issue with many multi-image tiles on screen at once).
- Whether touch behavior should eventually differentiate "tap image to cycle" from "tap image to open" via a more discoverable affordance (e.g. a subtle "swipe" hint) as the app's mobile traffic/accessibility needs mature.
- Whether this cycling behavior should later extend to homepage tiles once/if `FeaturedProducts`/`NewArrivals` are migrated onto the same `assets`-based data model as `/shop` (they currently read from the separate `products` collection and are out of scope here).
