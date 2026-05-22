'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useFeaturedProducts } from '@/hooks/useProducts';

export function FeaturedProducts() {
  const { products, loading, error } = useFeaturedProducts();

  return (
    <section className="border-t border-white/5 bg-secondary px-6 py-14">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <p className="mb-1 text-xs tracking-[0.3em] text-accent uppercase">Shop</p>
            <h2 className="text-2xl font-bold text-primary">Featured Products</h2>
          </div>
          <Link
            href="/shop"
            className="border-b border-muted/40 pb-0.5 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
          >
            View All →
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2">
          {loading && [0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="min-w-[160px] flex-shrink-0 animate-pulse overflow-hidden rounded-lg border border-white/8 bg-background"
            >
              <div className="h-[120px] bg-white/5" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-3/4 rounded bg-white/10" />
                <div className="h-4 w-1/2 rounded bg-white/10" />
              </div>
            </div>
          ))}

          {!loading && error && (
            <p className="text-xs text-muted">Couldn&apos;t load products</p>
          )}

          {!loading && !error && products.length === 0 && (
            <p className="text-xs text-muted">New products coming soon</p>
          )}

          {!loading && !error && products.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="min-w-[160px] flex-shrink-0 overflow-hidden rounded-lg border border-white/8 bg-background transition-colors hover:border-white/20"
            >
              <div className="relative h-[120px] bg-white/5">
                {p.mockupImageUrl ? (
                  <Image
                    src={p.mockupImageUrl}
                    alt={p.name}
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="h-12 w-12 rounded bg-white/10" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="mb-1 text-xs text-muted">{p.name}</p>
                <p className="text-sm font-semibold text-primary">
                  {typeof p.price === 'number' ? `$${p.price.toFixed(2)}` : 'Price TBA'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
