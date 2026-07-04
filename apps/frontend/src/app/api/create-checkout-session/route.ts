/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/create-checkout-session/route.ts
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

type DesignPlacement = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

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
  designImageUrl?: string | null;
  productCategory?: string | null;
  placement?: DesignPlacement | null;

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

    // Look up each unique product's real price server-side — never trust
    // the client-supplied item.price for the amount actually charged.
    const uniqueProductIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
    const productPriceById = new Map<string, number>();

    const productSnaps = await Promise.all(
      uniqueProductIds.map((id) => adminDb.collection('products').doc(id).get()),
    );

    const missingProductIds: string[] = [];
    productSnaps.forEach((snap, i) => {
      const id = uniqueProductIds[i];
      if (!snap.exists) {
        missingProductIds.push(id);
        return;
      }
      const data = snap.data();
      const price = typeof data?.price === 'number' ? data.price : 25; // matches /shop's fallback
      productPriceById.set(id, price);
    });

    if (missingProductIds.length > 0) {
      return NextResponse.json(
        { error: `Unknown product(s) in cart: ${missingProductIds.join(', ')}` },
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

      // Server-verified price only — item.price is no longer trusted for the charge amount.
      const unitPrice = productPriceById.get(item.productId ?? '') ?? 25;

      const unit_amount = Math.max(50, Math.round(unitPrice * 100)); // at least $0.50
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
        designImageUrl: item.designImageUrl ?? null,
        productCategory: item.productCategory ?? null,
        placement: item.placement ?? null,
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
