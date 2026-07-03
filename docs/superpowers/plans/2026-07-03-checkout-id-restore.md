# Restore checkoutId Order-Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the `checkoutId` generation, `checkout_sessions` Firestore pre-write, and `metadata.checkoutId` in `create-checkout-session/route.ts` so that `stripe-webhook/route.ts` can create `orders` docs again — closing a gap that has silently dropped every order record since commit `688cf66` (2026-01-30).

**Architecture:** Single-file fix. `stripe-webhook/route.ts` already correctly reads `session.metadata.checkoutId`, looks up a `checkout_sessions/{checkoutId}` doc for item/amount details, and upserts `orders/{checkoutId}` — it needs no changes. Only `create-checkout-session/route.ts` needs the missing half of the contract restored: generate a `checkoutId`, write the `checkout_sessions` doc before creating the Stripe session, and pass `checkoutId` in `metadata`.

**Tech Stack:** Next.js 16 App Router API route, `stripe` SDK, `firebase-admin` (via `@/lib/firebaseAdmin`).

## Global Constraints

- Only modify `apps/frontend/src/app/api/create-checkout-session/route.ts`. Do not touch `stripe-webhook/route.ts` (already correct) or any frontend cart page (payload shape sent by `/cart` is unaffected).
- Preserve the current per-item pricing logic (`item.price` fallback chain, `Math.max(50, …)` floor) — do not revert to the old flat-$25-per-item pricing from the pre-regression version.
- Use `randomUUID` from Node's built-in `crypto` module and `adminDb` / `FieldValue` from `@/lib/firebaseAdmin`, matching the exact pattern already used in `stripe-webhook/route.ts`.
- No new dependencies. No new test framework — this repo has none configured today; verification is a manual Stripe test-mode checkout (per explicit user decision), not automated tests.
- This is real-payment-adjacent code: the manual verification step is not optional busywork — it must actually be run and its Firestore output actually inspected before this is considered done.

---

### Task 1: Restore checkoutId + checkout_sessions pre-write in create-checkout-session

**Files:**
- Modify: `apps/frontend/src/app/api/create-checkout-session/route.ts` (full replacement of file contents)

**Interfaces:**
- Consumes: `stripe` export from `@/lib/stripe` (existing), `adminDb` + `FieldValue` exports from `@/lib/firebaseAdmin` (existing, already used identically in `apps/frontend/src/app/api/stripe-webhook/route.ts:5`).
- Produces: `metadata.checkoutId` on the created Stripe Checkout Session (consumed by `stripe-webhook/route.ts:33`), a `checkout_sessions/{checkoutId}` Firestore doc (consumed by `stripe-webhook/route.ts:45,53`), and a `checkoutId` field in the route's JSON response (not currently consumed by any frontend code — `apps/frontend/src/app/cart/page.tsx:79` only reads `data.url` — but returned for parity with the pre-regression contract and future use).

- [ ] **Step 1: Confirm current behavior before changing anything**

Run: `cd /home/ibjjr/Project_AI_Merch/apps/frontend && npx tsc --noEmit`
Expected: no errors (clean baseline before edit).

- [ ] **Step 2: Replace the full contents of `create-checkout-session/route.ts`**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/create-checkout-session/route.ts
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

type CheckoutItemPayload = {
  id: string;
  assetId: string;
  productId: string;
  assetTitle: string;
  productName: string;
  price: number;
  mockupImageUrl?: string | null;
  quantity: number;
  size?: string;

  // optional legacy fields we might still see:
  product?: any;
  mockup_image_url?: string;
  imageUrl?: string;
  mockup_base_image?: string;
};

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

export async function POST(req: NextRequest) {
  if (!stripe) {
    console.error('[API] stripe client is not configured');
    return NextResponse.json(
      { error: 'Stripe is not configured on the server.' },
      { status: 500 },
    );
  }

  // Generated up front so the catch block can always mark this checkout as
  // errored, even if body parsing or Stripe session creation fails.
  const checkoutId = randomUUID();
  const checkoutRef = adminDb.collection('checkout_sessions').doc(checkoutId);

  try {
    const body = await req.json();
    const userId: string = body?.userId ?? 'anon';
    const items: CheckoutItemPayload[] = Array.isArray(body?.items)
      ? body.items
      : [];

    if (!items.length) {
      return NextResponse.json(
        { error: 'No items provided for checkout.' },
        { status: 400 },
      );
    }

    let subtotalCents = 0;

    const normalizedItems = items.map((item) => {
      // image fallback: new flat fields first, then any legacy product object
      const imageUrl =
        item.mockupImageUrl ??
        item.mockup_image_url ??
        item.imageUrl ??
        item.mockup_base_image ??
        item.product?.mockupImageUrl ??
        item.product?.mockup_image_url ??
        item.product?.imageUrl ??
        item.product?.mockup_base_image ??
        null;

      // prefer flat price from cart; fall back to old product.price/base_price
      const unitPrice =
        typeof item.price === 'number' && !Number.isNaN(item.price)
          ? item.price
          : (item.product?.price ?? item.product?.base_price ?? 0);

      const unit_amount = Math.max(50, Math.round((unitPrice || 0) * 100)); // at least $0.50
      const quantity = item.quantity || 1;
      subtotalCents += unit_amount * quantity;

      return {
        cartItemId: item.id ?? '',
        assetId: item.assetId ?? '',
        assetTitle: item.assetTitle ?? '',
        productId: item.productId ?? '',
        productName: item.productName ?? item.product?.name ?? 'Product',
        quantity,
        unitAmountCents: unit_amount,
        mockupImageUrl: imageUrl,
        size: item.size ?? null,
      };
    });

    const itemCount = normalizedItems.reduce((sum, i) => sum + i.quantity, 0);

    // Pre-write checkout_sessions doc BEFORE creating the Stripe session so the
    // webhook (keyed on metadata.checkoutId) always has an items/amounts record
    // to build the order from, even if Stripe's own session payload is sparse.
    await checkoutRef.set({
      checkoutId,
      status: 'created',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      user: { userId },
      amounts: { currency: 'usd', itemCount, subtotalCents },
      items: normalizedItems,
    });

    const line_items = normalizedItems.map((item) => ({
      price_data: {
        currency: 'usd',
        unit_amount: item.unitAmountCents,
        product_data: {
          name: item.productName,
          description: [
            item.size ? `Size: ${item.size}` : null,
            item.assetId ? `Design: ${item.assetId}` : null,
          ].filter(Boolean).join(' · ') || undefined,
          images: item.mockupImageUrl ? [item.mockupImageUrl] : [],
          metadata: {
            assetId: item.assetId,
            productId: item.productId,
            cartItemId: item.cartItemId,
            assetTitle: item.assetTitle,
            size: item.size ?? '',
          },
        },
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url:
        process.env.CHECKOUT_SUCCESS_URL ??
        'http://localhost:3000/checkout/success',
      cancel_url:
        process.env.CHECKOUT_CANCEL_URL ??
        'http://localhost:3000/checkout/cancel',
      metadata: { checkoutId, userId },
    });

    if (!session.url) {
      console.error('[API] Stripe session created without URL:', session.id);
      await checkoutRef.set(
        {
          status: 'error',
          updatedAt: FieldValue.serverTimestamp(),
          error: 'Stripe session created without URL',
        },
        { merge: true },
      );
      return NextResponse.json(
        { error: 'Stripe session URL missing from Stripe response.' },
        { status: 500 },
      );
    }

    await checkoutRef.set(
      {
        status: 'stripe_created',
        updatedAt: FieldValue.serverTimestamp(),
        'stripe.sessionId': session.id,
        'stripe.paymentIntentId':
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
      },
      { merge: true },
    );

    log('checkout_session.created', { checkoutId, sessionId: session.id });

    // 👈 this is what your CartPage expects
    return NextResponse.json({ url: session.url, checkoutId });
  } catch (err: any) {
    console.error('[API] create-checkout-session failed:', err);

    try {
      await checkoutRef.set(
        {
          status: 'error',
          updatedAt: FieldValue.serverTimestamp(),
          error: err?.message ?? 'Internal server error',
        },
        { merge: true },
      );
    } catch {
      // best-effort only — don't mask the original error with a Firestore write failure
    }

    return NextResponse.json(
      { error: err?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles clean**

Run: `cd /home/ibjjr/Project_AI_Merch/apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run lint**

Run: `cd /home/ibjjr/Project_AI_Merch/apps/frontend && npm run lint`
Expected: no new errors introduced (pre-existing warnings in other files are fine).

- [ ] **Step 5: Manual Stripe test-mode verification — start servers**

Run in one terminal (background):
```bash
cd /home/ibjjr/Project_AI_Merch/apps/frontend && npm run dev
```
Expected: `Ready` on `http://localhost:3000`.

Run in a second terminal (background):
```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
```
Expected: prints `Ready! Your webhook signing secret is whsec_...`. Copy that value.

- [ ] **Step 6: Point the running server at the CLI's webhook secret**

If the printed `whsec_...` differs from `STRIPE_WEBHOOK_SECRET` in `apps/frontend/.env.local`, update it there and restart the `npm run dev` process from Step 5 so the webhook signature check passes locally.

- [ ] **Step 7: Trigger a real checkout session via the API**

Run:
```bash
curl -s -X POST http://localhost:3000/api/create-checkout-session \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "manual-test",
    "items": [{
      "id": "manual-test-item-0",
      "assetId": "manual-test-asset",
      "productId": "manual-test-product",
      "assetTitle": "Manual Test Design",
      "productName": "Manual Test Tee",
      "price": 25,
      "quantity": 1
    }]
  }'
```
Expected: JSON response containing `url` (a `https://checkout.stripe.com/...` link) and `checkoutId` (a UUID). Note the `checkoutId` value for Step 9.

- [ ] **Step 8: Complete the checkout in a browser**

Open the `url` from Step 7's response. Use Stripe's test card `4242 4242 4242 4242`, any future expiry date, any 3-digit CVC, any billing ZIP. Submit payment.
Expected: redirected to `http://localhost:3000/checkout/success`. The terminal running `stripe listen` shows a `checkout.session.completed` event forwarded with a `200` response from the app.

- [ ] **Step 9: Verify checkout_sessions doc transitioned correctly**

Run (from `apps/frontend/ops/firebase-admin`, reusing its existing `.env` / `dotenv` setup):
```bash
cd /home/ibjjr/Project_AI_Merch/apps/frontend/ops/firebase-admin && node -e "
import('dotenv/config').then(async () => {
  const admin = (await import('firebase-admin')).default;
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  const doc = await admin.firestore().collection('checkout_sessions').doc('<CHECKOUT_ID_FROM_STEP_7>').get();
  console.log(JSON.stringify(doc.data(), null, 2));
});
"
```
Expected: `status: 'paid'` (webhook updates it from `'stripe_created'` after the event fires), `stripe.sessionId` matching the session from Step 7.

- [ ] **Step 10: Verify an orders doc was created**

Run the same pattern against `orders` instead of `checkout_sessions`, using the same `<CHECKOUT_ID_FROM_STEP_7>` as the doc ID.
Expected: a doc exists with `status: 'paid'`, `fulfillment.status: 'unfulfilled'`, `items` containing the one manual-test item with `unitAmountCents: 2500`, `checkoutId` matching. **This is the core proof the fix works** — this doc would not have existed before this change.

- [ ] **Step 11: Stop the manual test servers**

Kill the `npm run dev` and `stripe listen` background processes from Step 5.

- [ ] **Step 12: Commit**

```bash
cd /home/ibjjr/Project_AI_Merch && git add apps/frontend/src/app/api/create-checkout-session/route.ts
git commit -m "fix: restore checkoutId generation in create-checkout-session

Commit 688cf66 (2026-01-30) dropped checkoutId/checkout_sessions/metadata
when rewriting this route, silently breaking order-doc creation for every
completed purchase since. stripe-webhook/route.ts already expects
metadata.checkoutId and was unaffected. Verified via manual Stripe
test-mode checkout: checkout_sessions and orders docs now created and
transition to status=paid correctly."
```

---

## Self-Review

**Spec coverage:** checkoutId generation ✅ (Step 2), checkout_sessions pre-write ✅ (Step 2), metadata.checkoutId on session ✅ (Step 2), no changes to webhook or frontend ✅ (Global Constraints + Task 1 file scope), pricing logic preserved ✅ (unitPrice fallback chain kept identical to current file), manual verification instead of automated tests ✅ (Steps 5–10), real order doc actually inspected ✅ (Step 10).

**Placeholder scan:** no TBD/TODO markers; all code steps contain complete file contents; all commands are concrete with expected output stated.

**Type consistency:** `CheckoutItemPayload` type unchanged from current file. New `normalizedItems` shape (`cartItemId`, `assetId`, `assetTitle`, `productId`, `productName`, `quantity`, `unitAmountCents`, `mockupImageUrl`, `size`) is used consistently across the `checkout_sessions` write and the `line_items` construction within the same task — no cross-task signature drift since this is a single-task plan.

**Known pre-existing issue found during investigation, intentionally out of scope:** `apps/frontend/src/app/cart/page.tsx:58-69` builds its checkout POST payload without `price` or `mockupImageUrl` fields, meaning today every cart checkout falls through to the `Math.max(50, …)` floor (charges $0.50/item regardless of real price) and gets no line-item image. This is a separate, real bug but unrelated to the checkoutId regression — flagged here for a future fix, not bundled into this plan.
