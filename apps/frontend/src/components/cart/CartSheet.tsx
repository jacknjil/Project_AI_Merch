'use client';

import { useCart } from '@/context/CartContext';
import { Button } from '@/components/ui/Button';
import { loadStripe } from '@stripe/stripe-js';
import { Fragment } from 'react';

// Initialize Stripe client-side
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

export function CartSheet() {
  const { items, removeItem, cartTotal, isOpen, setIsOpen } = useCart();

  const handleCheckout = async () => {
    const stripe = await stripePromise;
    if (!stripe) return;

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      });

      const { sessionId } = await response.json();
      if (sessionId) {
        await (stripe as any).redirectToCheckout({ sessionId });
      }
    } catch (error) {
      console.error('Checkout error:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col h-full animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold font-heading">Your Cart</h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
              <p>Your cart is empty.</p>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Continue Shopping
              </Button>
            </div>
          ) : (
            items.map((item, idx) => {
              const image = item.product.mockupImageUrl || 
                            item.product.mockup_image_url || 
                            item.product.imageUrl || 
                            item.product.mockup_base_image;
              const price = item.product.price ?? item.product.base_price ?? 0;

              return (
                <div key={`${item.product.id}-${idx}`} className="flex gap-4 border-b pb-4 last:border-0">
                  <div className="w-20 h-20 bg-gray-100 rounded-md overflow-hidden flex-shrink-0">
                    {image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt={item.product.name} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">{item.product.name}</h3>
                    <p className="text-sm text-gray-500">
                       Qty: {item.quantity} 
                       {item.assetId && <span className="block text-xs text-accent">Customized</span>}
                    </p>
                    <div className="flex justify-between items-center mt-2">
                       <span className="font-bold text-sm">${(price * item.quantity).toFixed(2)}</span>
                       <button 
                         onClick={() => removeItem(item.product.id, item.assetId)}
                         className="text-xs text-red-500 hover:underline"
                       >
                         Remove
                       </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 border-t bg-gray-50">
            <div className="flex justify-between mb-4 font-bold text-lg">
              <span>Total</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
            <Button onClick={handleCheckout} className="w-full" size="lg" variant="primary">
              Checkout
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
