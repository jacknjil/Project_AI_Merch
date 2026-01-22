import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey)
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-11-17.clover', // pick whatever you use elsewhere; keep consistent
});

// Helpful when behind Nginx / reverse proxy
function getOrigin(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    'localhost:3000';
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const checkoutId = randomUUID(); // our Firestore doc id
  const createdAtMs = Date.now();

  // Create ref once so catch() can update it too
  const checkoutRef = adminDb.collection('checkout_sessions').doc(checkoutId);

  try {
    const body = await req.json();

    const items: Array<{
      id: string;
      assetId: string;
      productId: string;
      assetTitle: string;
      productName: string;
      quantity: number;
      mockupImageUrl?: string | null;
      scale?: number;
      position?: { x: number; y: number };
    }> = body.items ?? [];

    if (!items.length) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    // TEMP: flat price per item (e.g. $25.00)
    const UNIT_AMOUNT_CENTS = 2500;

    const normalizedItems = items.map((i) => ({
      ...i,
      quantity: Number.isFinite(i.quantity) && i.quantity > 0 ? i.quantity : 1,
    }));

    const itemCount = normalizedItems.reduce((sum, i) => sum + i.quantity, 0);
    const subtotalCents = normalizedItems.reduce(
      (sum, i) => sum + i.quantity * UNIT_AMOUNT_CENTS,
      0,
    );

    // ✅ STEP A-1: create Firestore checkout_sessions doc BEFORE Stripe redirect
    await checkoutRef.set({
      checkoutId,
      status: 'created',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),

      user: {
        userId: body.userId ?? 'unknown',
      },

      amounts: {
        currency: 'usd',
        unitAmountCents: UNIT_AMOUNT_CENTS,
        itemCount,
        subtotalCents,
      },

      stripe: {
        sessionId: null,
        paymentIntentId: null,
      },

      items: normalizedItems.map((i) => ({
        cartItemId: i.id,
        assetId: i.assetId,
        assetTitle: i.assetTitle,
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,

        // optional for manual fulfillment:
        mockupImageUrl: i.mockupImageUrl ?? null,
        scale: i.scale ?? null,
        position: i.position ?? null,
      })),

      debug: {
        createdAtMs,
      },
    });

    // Stripe line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      normalizedItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: UNIT_AMOUNT_CENTS,
          product_data: {
            name: `${item.productName} - ${item.assetTitle}`,
            metadata: {
              assetId: item.assetId,
              productId: item.productId,
              cartItemId: item.id,
            },
          },
        },
      }));

    const origin = getOrigin(req);

    // ✅ STEP A-2: create Stripe session with checkoutId in metadata
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/cart?status=success&checkoutId=${checkoutId}`,
      cancel_url: `${origin}/cart?status=cancel&checkoutId=${checkoutId}`,

      metadata: {
        checkoutId,
        userId: body.userId ?? 'unknown',
      },
    });

    // ✅ STEP A-3: update checkout_sessions doc with stripe.sessionId
    await checkoutRef.update({
      status: 'stripe_created',
      updatedAt: FieldValue.serverTimestamp(),
      'stripe.sessionId': session.id,
      'stripe.paymentIntentId':
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : null,
    });

    return NextResponse.json({ url: session.url, checkoutId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('Error creating checkout session:', err);

    // Best effort: mark Firestore doc as error (if it exists)
    try {
      await checkoutRef.set(
        {
          status: 'error',
          updatedAt: FieldValue.serverTimestamp(),
          error: err?.message ?? 'Internal server error',
        },
        { merge: true },
      );
    } catch {}

    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500 },
    );
  }
}
