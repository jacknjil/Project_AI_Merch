/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, use } from 'react';
//import { useRouter } from 'next/navigation'; // Correct import for App Router navigation
import Link from 'next/link';

import { Product } from '@/lib/types';
//import { Header } from '@/components/layout/Header';
//import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/Button';
import { useCart } from '@/context/CartContext';
import Image from 'next/image';

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  // 1. Resolve params using 'use' immediately
  const resolvedParams = use(params);
  const productId = resolvedParams.productId;

  //const { getProduct } = useProducts();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true; // Prevents state updates on unmounted component

    async function load() {
      try {
        setLoading(true);
        const p = await productId;
        if (isMounted) {
          setProduct(p);
          setLoading(false);
        }
      } catch (error) {
        console.error('Failed to load product:', error);
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [productId]);
  // Removed getProduct from dependency to stop the flicker

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <p className="animate-pulse text-gray-500">
            Loading product details...
          </p>
        </main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex flex-col items-center justify-center gap-4">
          <h1 className="text-2xl font-bold">Product Not Found</h1>
          <Link href="/products">
            <Button variant="outline">Back to Shop</Button>
          </Link>
        </main>
      </div>
    );
  }

  const resolveImage = (p: any) =>
    p.mockupImageUrl ||
    p.mockup_image_url ||
    p.imageUrl ||
    p.mockup_base_image ||
    null;
  const resolvePrice = (p: any) => p.price ?? p.base_price ?? 0;

  const image = resolveImage(product);
  const price = resolvePrice(product);

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="container mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-24">
          {/* Image Column: Dark Glassmorphism */}
          <div className="bg-white/5 rounded-4xl overflow-hidden aspect-square flex items-center justify-center border border-white/10 shadow-2xl group">
            {image ? (
              <Image
                src={image}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <span className="text-white/20 font-mono italic">
                No Preview Available
              </span>
            )}
          </div>

          {/* Info Column */}
          <div className="flex flex-col gap-8 justify-center">
            <div>
              <h1 className="text-5xl font-light tracking-tighter mb-4">
                {/* ADD THE GUARD: product?.name && ... */}
                {
                  product?.name
                    ? product.name.split(' ').map((word, i) =>
                        i === 0 ? (
                          word
                        ) : (
                          <span key={i} className="font-bold text-cyan-400">
                            {' '}
                            {word}
                          </span>
                        ),
                      )
                    : 'Loading Product...' // Fallback text while data is in transit
                }
              </h1>
              <p className="text-3xl font-mono text-white/90">
                ${price?.toFixed(2) || '0.00'}
              </p>
            </div>

            <div className="max-w-md">
              <p className="text-lg text-white/60 leading-relaxed font-light">
                {product.description ||
                  'Experimental AI-mapped garment designed for the digital frontier.'}
              </p>
            </div>

            <div className="h-px bg-linear-to-r from-cyan-500/50 to-transparent my-2" />

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="flex-1 bg-white text-black hover:bg-cyan-400 transition-all font-bold rounded-full py-6"
                onClick={() => addItem(product)}
              >
                Add to Cart
              </Button>

              {product.defaultAssetId ? (
                <Link
                  href={`/studio?productId=${product.id}&assetId=${product.defaultAssetId}`}
                  className="flex-1"
                >
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full border-white/20 hover:border-cyan-400 rounded-full py-6"
                  >
                    Customize with AI
                  </Button>
                </Link>
              ) : (
                <Button
                  size="lg"
                  variant="secondary"
                  disabled
                  className="flex-1 opacity-20 cursor-not-allowed rounded-full py-6"
                >
                  Customization Locked
                </Button>
              )}
            </div>

            <p className="text-xs text-gray-500 text-center sm:text-left mt-2">
              Fast shipping • High quality materials • AI Generated
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
