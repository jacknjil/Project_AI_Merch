'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAssets } from '@/hooks/useAssets';
import { Asset } from '@/lib/types';
import { Button } from '@/components/ui/Button';

export default function GalleryPage() {
  const { assets, loading, error } = useAssets(20);
  const [selected, setSelected] = useState<Asset | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-white/5 px-6 py-4">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">AI Studio</p>
        <h1 className="text-2xl font-black text-primary">Pick Your Art</h1>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* Generate New CTA */}
        <Link
          href="/studio/generate"
          className="flex items-center gap-3 rounded-lg border border-dashed border-accent/50 bg-accent/5 p-4 transition-colors hover:bg-accent/10"
        >
          <span className="text-xl">✨</span>
          <div>
            <p className="text-sm font-semibold text-accent">Generate New Art</p>
            <p className="text-xs text-muted">Create something unique with DALL·E →</p>
          </div>
        </Link>

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-secondary" />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && assets.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-primary">No art yet</p>
            <p className="text-xs text-muted">Be the first to generate!</p>
          </div>
        )}

        {/* Asset grid */}
        {!loading && !error && assets.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() =>
                    setSelected(asset.id === selected?.id ? null : asset)
                  }
                  className={`overflow-hidden rounded-lg border-2 transition-colors ${
                    selected?.id === asset.id
                      ? 'border-accent'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="relative aspect-square bg-secondary">
                    <Image
                      src={asset.imageUrl}
                      alt={asset.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="p-2 text-left">
                    <p className="truncate text-xs font-medium text-primary">
                      {asset.title}
                    </p>
                    {asset.niche && (
                      <p className="text-xs text-muted">{asset.niche}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <Button
                variant="primary"
                size="lg"
                disabled={!selected}
                onClick={() =>
                  selected && router.push(`/studio/apply?assetId=${selected.id}`)
                }
                className="flex-1"
              >
                Use This Art →
              </Button>
              <Button
                variant="outline"
                size="lg"
                disabled={!selected}
                onClick={() =>
                  selected && router.push(`/studio/remix?assetId=${selected.id}`)
                }
                className="flex-1"
              >
                Remix Prompt →
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
