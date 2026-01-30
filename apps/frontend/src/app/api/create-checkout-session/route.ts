import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { CartItem } from '@/context/CartContext';

export async function POST(req: Request) {
  try {
    const { items }: { items: CartItem[] } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map((item) => {
        // Fallback for missing images in legacy data
        const imageUrl = item.product.mockupImageUrl || 
                         item.product.mockup_image_url || 
                         item.product.imageUrl || 
                         item.product.mockup_base_image;
                         
        const images = imageUrl ? [imageUrl] : [];
        const price = item.product.price ?? item.product.base_price ?? 0;

        return {
          price_data: {
            currency: 'usd',
            product_data: {
              name: item.product.name,
              description: item.assetId ? `Customized (Asset: ${item.assetId})` : undefined,
              images: images,
            },
            unit_amount: Math.round(price * 100), // Stripe expects cents
          },
          quantity: item.quantity,
        };
      }),
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/orders?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/cart?canceled=true`,
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (err: any) {
    console.error('Stripe error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
