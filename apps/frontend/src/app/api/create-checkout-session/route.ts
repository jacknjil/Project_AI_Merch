/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/create-checkout-session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

type CheckoutItemPayload = {
  id: string;
  assetId: string;
  productId: string;
  assetTitle: string;
  productName: string;
  price: number;
  mockupImageUrl?: string | null;
  quantity: number;

  // optional legacy fields we might still see:
  product?: any;
  mockup_image_url?: string;
  imageUrl?: string;
  mockup_base_image?: string;
};

export async function POST(req: NextRequest) {
  try {
    if (!stripe) {
      // if your lib/stripe can ever export undefined/null
      console.error('[API] stripe client is not configured');
      return NextResponse.json(
        { error: 'Stripe is not configured on the server.' },
        { status: 500 },
      );
    }

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

    const line_items = items.map((item) => {
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

      const images = imageUrl ? [imageUrl] : [];

      // prefer flat price from cart; fall back to old product.price/base_price
      const unitPrice =
        typeof item.price === 'number' && !Number.isNaN(item.price)
          ? item.price
          : (item.product?.price ?? item.product?.base_price ?? 0);

      const unit_amount = Math.max(50, Math.round((unitPrice || 0) * 100)); // at least $0.50

      return {
        price_data: {
          currency: 'usd',
          unit_amount,
          product_data: {
            name: item.productName ?? item.product?.name ?? 'Product',
            description: item.assetId
              ? `Customized (Asset: ${item.assetId})`
              : undefined,
            images,
            metadata: {
              assetId: item.assetId ?? '',
              productId: item.productId ?? '',
              cartItemId: item.id ?? '',
              assetTitle: item.assetTitle ?? '',
            },
          },
        },
        quantity: item.quantity || 1,
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url:
        process.env.CHECKOUT_SUCCESS_URL ??
        'http://localhost:3000/checkout/success',
      cancel_url:
        process.env.CHECKOUT_CANCEL_URL ??
        'http://localhost:3000/checkout/cancel',
      metadata: { userId },
    });

    if (!session.url) {
      console.error('[API] Stripe session created without URL:', session.id);
      return NextResponse.json(
        { error: 'Stripe session URL missing from Stripe response.' },
        { status: 500 },
      );
    }

    // 👈 this is what your CartPage expects
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[API] create-checkout-session failed:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
