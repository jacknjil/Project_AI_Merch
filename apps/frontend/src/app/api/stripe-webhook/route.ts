/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/stripe-webhook/route.ts
import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

const stripeSecretKey = mustEnv('STRIPE_SECRET_KEY');
const webhookSecret = mustEnv('STRIPE_WEBHOOK_SECRET');

// Use your account version (or set STRIPE_API_VERSION in env)
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: (process.env.STRIPE_API_VERSION ?? '2025-11-17.clover') as any,
});

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
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json(
      { ok: false, error: 'Missing stripe-signature header' },
      { status: 400 },
    );
  }

  let stripeEvent: Stripe.Event;

  try {
    const rawBody = await req.text(); // required for signature verification
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
