'use client';

import Link from 'next/link';
import { useProducts } from '@/hooks/useProducts';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function ProductsPage() {
  const { products, loading, error } = useProducts();

  const resolveImage = (p: any) => {
    return p.mockupImageUrl || p.mockup_image_url || p.imageUrl || p.mockup_base_image || null;
  };

  const resolvePrice = (p: any) => {
    return p.price ?? p.base_price ?? 0;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50/50">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-heading mb-2">Shop Collection</h1>
          <p className="text-gray-500">Discover AI-generated premium apparel.</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <p className="text-gray-500 animate-pulse">Loading collection...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 text-red-500 rounded-md">
            Error loading products: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => {
              const image = resolveImage(product);
              const price = resolvePrice(product);
              
              return (
                <Link href={`/products/${product.id}`} key={product.id} className="group">
                  <Card className="h-full overflow-hidden transition-all duration-300 hover:shadow-md hover:border-black/20">
                    <div className="aspect-square relative bg-gray-100 overflow-hidden">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={image} 
                          alt={product.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                          No Image
                        </div>
                      )}
                    </div>
                    <CardHeader className="p-4">
                      <div className="flex justify-between items-start gap-2">
                        <CardTitle className="text-lg">{product.name}</CardTitle>
                        <span className="font-medium font-mono text-sm">
                          ${price.toFixed(2)}
                        </span>
                      </div>
                      {product.description && (
                         <CardDescription className="line-clamp-2 text-xs mt-1">
                           {product.description}
                         </CardDescription>
                      )}
                    </CardHeader>
                    <CardFooter className="p-4 pt-0">
                      <Button variant="secondary" className="w-full group-hover:bg-primary group-hover:text-white transition-colors">
                        View Details
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
        
        {!loading && products.length === 0 && (
           <div className="text-center py-20 text-gray-500">
             No products found in the catalog.
           </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
