/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/stripe-webhook/route.ts
import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

// 1. Safe Env Getter: Returns null instead of throwing during BUILD
function getEnvSafe(name: string): string | null {
  return process.env[name] ?? null;
}

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

const stripeSecretKey = getEnvSafe('STRIPE_SECRET_KEY');
const webhookSecret = getEnvSafe('STRIPE_WEBHOOK_SECRET');

// 2. Initialize Stripe only if key exists.
// Hardcode the version to match your other route (2025-12-15.clover)
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover' as any,
    })
  : null;

async function upsertOrderFromCheckoutSession(stripeEvent: Stripe.Event) {
  // We only care about checkout.session.* events here
  const session = stripeEvent.data.object as Stripe.Checkout.Session;

  const checkoutId = session?.metadata?.checkoutId ?? null;
  const userId = session?.metadata?.userId ?? 'unknown';

  if (!checkoutId) {
    log('orders.skip_missing_checkoutId', {
      eventId: stripeEvent.id,
      type: stripeEvent.type,
      sessionId: session?.id ?? null,
    });
    return;
  }

  const checkoutRef = adminDb.collection('checkout_sessions').doc(checkoutId);
  const orderRef = adminDb.collection('orders').doc(checkoutId);

  await adminDb.runTransaction(async (tx) => {
    const [checkoutSnap, orderSnap] = await Promise.all([
      tx.get(checkoutRef),
      tx.get(orderRef),
    ]);
    const checkout = checkoutSnap.exists ? checkoutSnap.data() : null;
    const existingOrder = orderSnap.exists ? orderSnap.data() : null;

    // Build order payload using checkout_sessions (preferred) + Stripe session fallback
    const now = FieldValue.serverTimestamp();

    const items = (checkout?.items ?? []) as unknown[];
    const amounts = checkout?.amounts ?? {
      currency: session.currency ?? 'usd',
      subtotalCents: session.amount_subtotal ?? null,
      totalCents: session.amount_total ?? null,
    };

    const customerEmail =
      session.customer_details?.email ??
      (typeof session.customer_email === 'string'
        ? session.customer_email
        : null) ??
      null;

    const customerName = session.customer_details?.name ?? null;

    const orderPayload = {
      orderId: checkoutId,
      checkoutId,
      status: 'paid', // for MVP: paid == ready for manual fulfillment
      fulfillment: {
        status: 'unfulfilled', // you’ll update this manually later
        notes: null,
        updatedAt: now,
      },
      user: { userId },
      amounts,
      items,
      stripe: {
        eventId: stripeEvent.id,
        sessionId: session.id,
        paymentIntentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
        customerId:
          typeof session.customer === 'string' ? session.customer : null,
        paymentStatus: session.payment_status ?? null,
        amountTotal: session.amount_total ?? null,
        currency: session.currency ?? 'usd',
      },
      customer: {
        email: customerEmail,
        name: customerName,
      },
      updatedAt: now,
      createdAt: existingOrder?.createdAt ?? now, // preserve original if already exists
    };

    // Idempotent upsert
    tx.set(orderRef, orderPayload, { merge: true });

    // Also update checkout_sessions status so the UI can query it after redirect
    tx.set(
      checkoutRef,
      {
        status: 'paid',
        updatedAt: now,
        'stripe.sessionId': session.id,
        'stripe.paymentIntentId':
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
      },
      { merge: true },
    );
  });

  log('orders.upserted', {
    checkoutId,
    sessionId: session.id,
    eventId: stripeEvent.id,
  });
}

export async function POST(req: NextRequest) {
  // 3. Runtime Check: If these are missing on the VM, then we throw the error.
  if (!stripe || !webhookSecret) {
    log('stripe_webhook.config_error', {
      hasStripe: !!stripe,
      hasWebhookSecret: !!webhookSecret,
    });
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 },
    );
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json(
      { ok: false, error: 'Missing signature' },
      { status: 400 },
    );
  }

  let stripeEvent: Stripe.Event;

  try {
    const rawBody = await req.text();
    // 4. Use the initialized stripe object
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    log('stripe_webhook.signature_failed', {
      message: String(err?.message ?? err),
    });
    return NextResponse.json(
      { ok: false, error: 'Webhook signature verification failed' },
      { status: 400 },
    );
  }

  log('stripe_webhook.verified', {
    id: stripeEvent.id,
    type: stripeEvent.type,
  });

  // 1) Always persist event (idempotent)
  try {
    await adminDb
      .collection('stripe_events')
      .doc(stripeEvent.id)
      .set(
        {
          id: stripeEvent.id,
          type: stripeEvent.type,
          created: stripeEvent.created,
          livemode: stripeEvent.livemode,
          api_version: stripeEvent.api_version ?? null,
          data: stripeEvent.data, // if this ever hits size limits, we can slim it
          receivedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err: any) {
    // Fail so Stripe retries (we want to capture events)
    log('stripe_webhook.persist_failed', {
      message: String(err?.message ?? err),
    });
    return NextResponse.json(
      { ok: false, error: 'Failed to persist event' },
      { status: 500 },
    );
  }

  // 2) Create/update order on successful checkout
  try {
    if (
      stripeEvent.type === 'checkout.session.completed' ||
      stripeEvent.type === 'checkout.session.async_payment_succeeded'
    ) {
      await upsertOrderFromCheckoutSession(stripeEvent);
    }
  } catch (err: any) {
    // Fail so Stripe retries until we successfully create the order
    log('stripe_webhook.order_failed', {
      message: String(err?.message ?? err),
    });
    return NextResponse.json(
      { ok: false, error: 'Failed to create order' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
