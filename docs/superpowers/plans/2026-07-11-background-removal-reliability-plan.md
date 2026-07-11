# Background-Removal Reliability Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop apparel products from reaching Printify with their background still attached, by (1) making `publish-to-printify` fail loudly instead of silently proceeding when `removeBackground` errors, and (2) closing the fallback gap in `n8n/create-asset` that let uncategorized assets skip background removal entirely at generation time.

**Architecture:** One new shared constant (`DEFAULT_PRODUCT_CATEGORY`) in `src/lib/recraft.ts`, consumed by the two call sites that currently hardcode `'shirt'` independently (`admin/assets/page.tsx`) or not at all (`n8n/create-asset/route.ts`). One behavior change in `publish-to-printify/route.ts`'s error handling — no new abstractions.

**Tech Stack:** Next.js 16 App Router, TypeScript. No new test infrastructure — this repo's established convention (Vitest for pure logic only, routes verified manually) is unchanged by this fix, since none of the three changes are new pure functions.

## Global Constraints

- No new test infrastructure — verify via `npx tsc --noEmit`, `npm run lint` (baseline: 21 problems, 12 errors, 9 warnings, unrelated to these files), and one manual failure-path check.
- `publish-to-printify`'s new 502 response must use this route's existing error-response shape: `NextResponse.json({ error: message }, { status: N })` — no new response schema.
- Do not touch `crispUpscale` error handling in `publish-to-printify/route.ts` — out of scope, spec only covers the `removeBackground` failure path.
- Do not change `n8n/create-asset/route.ts`'s own `removeBackground` failure handling (the existing log-and-continue inside its loop, around line 249) — spec explicitly keeps that behavior; only the `needsBackgroundRemoval` fallback argument changes.

---

### Task 1: `DEFAULT_PRODUCT_CATEGORY` constant + consume it in both existing call sites

**Files:**
- Modify: `apps/frontend/src/lib/recraft.ts`
- Modify: `apps/frontend/src/app/api/n8n/create-asset/route.ts`
- Modify: `apps/frontend/src/app/admin/assets/page.tsx`

**Interfaces:**
- Produces: `DEFAULT_PRODUCT_CATEGORY: string` (value `'shirt'`), exported from `src/lib/recraft.ts`. Consumed by the other two files in this task, and available for Task 2 if needed (it is not).

- [ ] **Step 1: Add the constant**

In `apps/frontend/src/lib/recraft.ts`, immediately after line 47 (the closing `}` of `needsBackgroundRemoval`), insert:

```ts

export const DEFAULT_PRODUCT_CATEGORY = 'shirt';
```

- [ ] **Step 2: Use it in the n8n generation-time fallback**

In `apps/frontend/src/app/api/n8n/create-asset/route.ts`, line 6, replace:

```ts
import { recraftGenerate, removeBackground, needsBackgroundRemoval } from '@/lib/recraft';
```

with:

```ts
import { recraftGenerate, removeBackground, needsBackgroundRemoval, DEFAULT_PRODUCT_CATEGORY } from '@/lib/recraft';
```

Then find this line (currently around line 237, inside the `POST` handler after `recraftGenerate` is called):

```ts
    const removeBg = needsBackgroundRemoval(productCategory);
```

Replace with:

```ts
    const removeBg = needsBackgroundRemoval(productCategory || DEFAULT_PRODUCT_CATEGORY);
```

- [ ] **Step 3: Use it in the existing admin publish fallback**

In `apps/frontend/src/app/admin/assets/page.tsx`, line 15, replace:

```ts
import { Asset } from '@/lib/types';
```

with:

```ts
import { Asset } from '@/lib/types';
import { DEFAULT_PRODUCT_CATEGORY } from '@/lib/recraft';
```

Then find this line inside `publishToPrintify` (currently line 53):

```ts
          productCategory: asset.productCategory ?? 'shirt',
```

Replace with:

```ts
          productCategory: asset.productCategory ?? DEFAULT_PRODUCT_CATEGORY,
```

- [ ] **Step 4: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/recraft.ts apps/frontend/src/app/api/n8n/create-asset/route.ts apps/frontend/src/app/admin/assets/page.tsx
git commit -m "fix: share DEFAULT_PRODUCT_CATEGORY fallback across publish and n8n generation paths"
```

---

### Task 2: Block the publish when `removeBackground` fails

**Files:**
- Modify: `apps/frontend/src/app/api/publish-to-printify/route.ts`

**Interfaces:**
- Consumes: none new.
- Produces: no new exports; changes this route's response for one existing failure mode — a `removeBackground` error during an apparel publish now returns `{ error: string }` with HTTP 502 instead of `{ success: true, ... }` with the background intact. `admin/assets/page.tsx`'s existing `publishToPrintify` handler already treats any non-`ok` response as a failure (`if (!res.ok) throw new Error(data.error ?? 'Publish failed')`), so no client-side change is required for this task.

- [ ] **Step 1: Replace the silent-continue catch block**

In `apps/frontend/src/app/api/publish-to-printify/route.ts`, lines 28-34, replace:

```ts
    if (isApparel) {
      // Remove background first on the original (~1024px) — upscaled images exceed Recraft's size limit
      try {
        printUrl = await removeBackground(printUrl);
      } catch (bgErr) {
        console.warn('removeBackground failed, using image with background:', bgErr instanceof Error ? bgErr.message : bgErr);
      }
```

with:

```ts
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
```

(The `crispUpscale` try/catch immediately below this block, and the entire `else` branch for non-apparel, are unchanged — this task only touches the `removeBackground` catch.)

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/api/publish-to-printify/route.ts
git commit -m "fix: block Printify publish when background removal fails instead of continuing silently"
```

---

### Task 3: Verification

**Files:** none created or modified — verification only.

**Interfaces:** exercises both changes from Tasks 1-2 together.

- [ ] **Step 1: Full typecheck and lint**

Run: `cd apps/frontend && npx tsc --noEmit && npm run lint`
Expected: no type errors; lint at the same 21-problem baseline (12 errors, 9 warnings) as before this fix.

- [ ] **Step 2: Confirm the fallback constant is used consistently**

Run: `cd apps/frontend && grep -rn "'shirt'" src/app/admin/assets/page.tsx src/app/api/n8n/create-asset/route.ts src/app/api/publish-to-printify/route.ts`
Expected: no output — confirms no remaining hardcoded `'shirt'` literal in any of the three consuming files (the only remaining `'shirt'` string in the codebase should be the single definition inside `DEFAULT_PRODUCT_CATEGORY` in `src/lib/recraft.ts`).

- [ ] **Step 3: Manually verify the block-on-failure path**

Start the dev server: `cd apps/frontend && npm run dev`. In a second terminal, temporarily break background removal by exporting an invalid key for one request:

```bash
curl -s -X POST http://localhost:3000/api/publish-to-printify \
  -H "Content-Type: application/json" \
  -d '{"assetId":"nonexistent-test-id","imageUrl":"https://example.com/does-not-exist.png","title":"Test","productCategory":"shirt"}'
```

Expected: a `4xx`/`5xx` JSON error response (the fetch inside `removeBackground` will fail on the placeholder URL, exercising the new catch-and-block path) — confirms the route returns an error object instead of `{ success: true }`, and never reaches the Firestore-update step. Stop the dev server after this check (`pkill -f "next dev"` or Ctrl-C in its terminal).

- [ ] **Step 4: Final review**

Run `git log --oneline -5` to confirm both commits from Tasks 1-2 are present. Do not push — per this project's deployment setup, pushing to `main` triggers an automatic Cloud Build → Cloud Run production deploy, which remains the user's explicit decision.
