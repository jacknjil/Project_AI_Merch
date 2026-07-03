'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { getAsset } from '@/hooks/useAssets';
import { useProducts } from '@/hooks/useProducts';
import { Asset, Product } from '@/lib/types';
import { Button } from '@/components/ui/Button';

function ApplyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const assetId = searchParams.get('assetId');

  const [asset, setAsset] = useState<Asset | null>(null);
  const [assetLoading, setAssetLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { products, loading: productsLoading } = useProducts();

  useEffect(() => {
    if (!assetId) {
      setAssetLoading(false);
      router.replace('/studio/gallery');
      return;
    }
    getAsset(assetId).then((a) => {
      if (!a) {
        setAssetLoading(false);
        router.replace('/studio/gallery');
        return;
      }
      setAsset(a);
      setAssetLoading(false);
    });
  }, [assetId, router]);

  if (assetLoading || productsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="animate-pulse text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-white/5 px-6 py-4">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">AI Studio</p>
        <h1 className="text-2xl font-black text-primary">Choose a Product</h1>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* Selected asset preview */}
        {asset && (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-secondary p-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md">
              <Image
                src={asset.imageUrl}
                alt={asset.title}
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-primary">
                {asset.title}
              </p>
              <p className="text-xs text-muted">Your selected art</p>
            </div>
            <button
              onClick={() => router.push('/studio/gallery')}
              className="shrink-0 text-xs text-accent underline"
            >
              Change
            </button>
          </div>
        )}

        <p className="text-xs tracking-[0.2em] text-muted uppercase">
          Pick a product
        </p>

        {/* Product list */}
        <div className="flex flex-col gap-2">
          {products.map((product) => {
            const image = product.mockupImageUrl || null;
            const price = product.price ?? product.base_price ?? 0;
            const isSelected = selectedProduct?.id === product.id;

            return (
              <button
                key={product.id}
                onClick={() =>
                  setSelectedProduct(isSelected ? null : product)
                }
                className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-accent'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-background">
                  {image ? (
                    <Image
                      src={image}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">
                      ?
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold ${
                      isSelected ? 'text-accent' : 'text-primary'
                    }`}
                  >
                    {product.name}
                  </p>
                  <p className="text-xs text-muted">${price.toFixed(2)}</p>
                </div>
                {isSelected && (
                  <span className="shrink-0 text-sm text-accent">✓</span>
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="primary"
          size="lg"
          disabled={!selectedProduct}
          onClick={() =>
            selectedProduct &&
            router.push(
              `/studio/compose?assetId=${assetId}&productId=${selectedProduct.id}`,
            )
          }
          className="w-full"
        >
          Compose Design →
        </Button>
      </div>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="animate-pulse text-sm text-muted">Loading…</p>
        </div>
      }
    >
      <ApplyContent />
    </Suspense>
  );
}
