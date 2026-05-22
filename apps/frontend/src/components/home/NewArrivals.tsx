'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRecentProducts } from '@/hooks/useProducts';

export function NewArrivals() {
  const { products, loading, error } = useRecentProducts(6);

  return (
    <section className="border-t border-white/5 bg-secondary px-6 py-14">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <p className="mb-1 text-xs tracking-[0.3em] text-accent uppercase">Shop</p>
            <h2 className="text-2xl font-bold text-primary">New Arrivals</h2>
          </div>
          <Link
            href="/shop"
            className="border-b border-muted/40 pb-0.5 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
          >
            Browse All →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {loading && [0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-lg border border-white/8 bg-background"
            >
              <div className="h-[100px] bg-white/5" />
              <div className="space-y-1 p-3">
                <div className="h-3 w-3/4 rounded bg-white/10" />
                <div className="h-3 w-1/3 rounded bg-white/10" />
              </div>
            </div>
          ))}

          {!loading && error && (
            <p className="col-span-2 text-xs text-muted md:col-span-3">
              Couldn&apos;t load products
            </p>
          )}

          {!loading && !error && products.length === 0 && (
            <p className="col-span-2 text-center text-xs text-muted md:col-span-3">
              No products yet — check back soon
            </p>
          )}

          {!loading && !error && products.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="overflow-hidden rounded-lg border border-white/8 bg-background transition-colors hover:border-white/20"
            >
              <div className="relative h-[100px] bg-white/5">
                {p.mockupImageUrl ? (
                  <Image
                    src={p.mockupImageUrl}
                    alt={p.name}
                    fill
                    sizes="(min-width: 768px) 33vw, 50vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full bg-white/5" />
                )}
              </div>
              <div className="p-3">
                <p className="text-xs text-muted">{p.name}</p>
                <p className="text-xs text-muted">
                  {typeof p.price === 'number' ? `$${p.price.toFixed(2)}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
