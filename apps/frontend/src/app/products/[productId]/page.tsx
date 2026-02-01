'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation'; // Correct import for App Router navigation
import Link from 'next/link';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/lib/types';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/Button';
import { useCart } from '@/context/CartContext';

export default function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const router = useRouter();
  const { productId } = use(params);
  const { getProduct } = useProducts();
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const p = await getProduct(productId);
      setProduct(p);
      setLoading(false);
    };
    load();
  }, [productId, getProduct]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="animate-pulse text-gray-500">Loading product details...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center gap-4">
          <h1 className="text-2xl font-bold">Product Not Found</h1>
          <Link href="/products">
            <Button variant="outline">Back to Shop</Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const resolveImage = (p: any) => p.mockupImageUrl || p.mockup_image_url || p.imageUrl || p.mockup_base_image || null;
  const resolvePrice = (p: any) => p.price ?? p.base_price ?? 0;
  
  const image = resolveImage(product);
  const price = resolvePrice(product);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-20">
          {/* Image Column */}
          <div className="bg-gray-50 rounded-xl overflow-hidden aspect-square flex items-center justify-center border border-gray-100">
             {image ? (
               // eslint-disable-next-line @next/next/no-img-element
               <img 
                 src={image} 
                 alt={product.name}
                 className="w-full h-full object-cover"
               />
             ) : (
               <span className="text-gray-400">No Preview Available</span>
             )}
          </div>

          {/* Info Column */}
          <div className="flex flex-col gap-6 pt-4">
            <div>
              <h1 className="text-4xl font-bold font-heading mb-2">{product.name}</h1>
              <p className="text-2xl font-mono text-gray-900">${price.toFixed(2)}</p>
            </div>

            <div className="prose prose-sm text-gray-600 max-w-none">
              <p>{product.description || "No description available for this product."}</p>
            </div>

            <div className="h-px bg-gray-100 my-2" />

            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="flex-1"
                onClick={() => addItem(product)}
              >
                Add to Cart
              </Button>
              
              {product.defaultAssetId ? (
                <Link href={`/studio?productId=${product.id}&assetId=${product.defaultAssetId}`} className="flex-1">
                   <Button size="lg" variant="accent" className="w-full">
                     Customize with AI
                   </Button>
                </Link>
              ) : (
                <Button size="lg" variant="secondary" disabled className="flex-1 opacity-50 cursor-not-allowed">
                  Customization Unavailable
                </Button>
              )}
            </div>
            
            <p className="text-xs text-gray-500 text-center sm:text-left mt-2">
              Fast shipping • High quality materials • AI Generated
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
