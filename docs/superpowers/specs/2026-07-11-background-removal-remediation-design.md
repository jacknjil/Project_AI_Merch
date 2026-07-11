# Background-Removal Defect Remediation — Design

**Date:** 2026-07-11
**Related:** `2026-07-11-background-removal-reliability-design.md` (the code-level fix that prevents *new* occurrences of this defect); `2026-07-11-printify-delete-reconcile-design.md` (sibling one-off remediation pattern)

## Problem

An audit of all 10 live (`published`/`created`) assets on `/shop` found 5 with the exact defect signature described in the reliability-fix design: `source: 'n8n'` + empty `productCategory`, all created before today's code fix. Visually, these show an unremoved white background behind the design on black t-shirt mockups. Today's code fix prevents this for *future* n8n-generated assets but cannot retroactively repair a print file Printify already has.

**Affected assets** (Firestore doc ID | title | current `printifyProductId`):

| Doc ID | Title | Printify Product ID |
|---|---|---|
| `bhS1XfyMYmMKPZJ3qZcF` | Espresso Yourself Typography | `6a46c68bfd17053d220ae3f8` |
| `OjADemKuWemWqRddphsy` | Bear Hooked on Coffee | `6a37e739db0ae58ff9096dd6` |
| `P5dHgNHrsvDPuyz93hIm` | Farmers' Market Upheaval | `6a37e90341155d651f0a6932` |
| `EMOVPIyTXN6anPjhI6eF` | It's Okay To Not Be Okay Hand-Lettered Tee | `6a43c86946263fe7db0478e6` |
| `H52UoNHvtca3d24Mc34X` | Adventure Buddy Hike More Vintage Tee | `6a453edb00bf6028a60b1050` |

Each Firestore doc retains its original pre-removal `imageUrl` (Firebase Storage); no bg-removed copy exists anywhere yet.

## Scope

One-off remediation for exactly these 5 assets. Not a reusable admin tool — the upstream cause (n8n workflow's broken product-type routing, CLAUDE.md Known Open Issue #6) is still open and its own deferred item; building general tooling now would be speculative until that's addressed and the audit is re-run.

## Approach

For each asset, build and verify a fully corrected replacement product **before** touching the live defective one:

1. Read `imageUrl`, `title`, `niche` from the Firestore doc.
2. `removeBackground(imageUrl)` → `crispUpscale(result)` (`src/lib/recraft.ts`, same calls `publish-to-printify` makes for apparel).
3. `uploadImageToPrintify()` the corrected image.
4. `createPrintifyProduct({ productCategory: 'shirt', ... })` — hardcoded `'shirt'` (matches `DEFAULT_PRODUCT_CATEGORY`; all 5 are confirmed black-tee mockups).
5. `publishPrintifyProduct(newProduct.id)`.
6. `getPrintifyMockupImages(newProduct.id)` (reuses existing polling/retry logic).
7. Update the **same Firestore doc** (doc ID is what `/shop/[productId]` routes on, not the Printify product ID — the customer-facing URL never changes): new `printifyProductId`, new `mockupUrl`/`mockupImages`, `productCategory: 'shirt'` (closes the defect signature), `updatedAt`.
8. Delete the old Printify product (new `deletePrintifyProduct()` — plain `DELETE /shops/{shop_id}/products/{id}.json`; a documented, low-risk endpoint).

Rejected alternative: updating the existing Printify product in place via `PUT /shops/{shop_id}/products/{id}.json` with new `print_areas`. Printify's docs don't confirm whether mockups auto-regenerate or a republish is required on an already-published product, and the codebase has no prior exercised use of that endpoint. Recreating reuses 100% already-proven code paths (`createPrintifyProduct`, `publishPrintifyProduct`, `getPrintifyMockupImages` — used for every prior successful publish) and adds only one new, simple, well-documented `DELETE` call.

## Safety & error handling

- Sequential, per-asset: the old product is deleted only after the new one is created, published, and successfully written to Firestore. If any step fails for an asset, the script logs it and moves to the next asset, leaving that asset's old (defective but live) product untouched — never deleting before a working replacement exists.
- No partial state is reachable: the Firestore doc always points to a real, live Printify product (old defective one on failure, new corrected one on success) — never neither.
- **Staged rollout:** process asset 1 (Espresso Yourself Typography) alone first, pause, and show the corrected mockup URL for a manual sanity check. Only continue to the remaining 4 after explicit go-ahead, since deletion is immediate and irreversible per asset.

## Verification

No new automated test infra (matches this repo's established convention — no Firestore/external-API mocking exists here; Vitest is used for pure logic only):

- After asset 1: fetch the returned mockup URL directly and visually confirm the background is gone; confirm in Firestore that `printifyProductId` changed and `productCategory: 'shirt'` is set.
- After all 5: reload `/shop` in a real browser (not curl — it's client-rendered) and visually confirm all 5 corrected mockups render without a background box; spot-check that one old Printify product ID now 404s, confirming deletion.
- The script itself (`apps/frontend/remediate-bg-defect.mjs`) is deleted after the run, same convention as the audit scripts — a one-time data fix, not reusable code, never committed.
