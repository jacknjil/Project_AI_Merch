'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAsset } from '@/hooks/useAssets';
import { Asset } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type GeneratedAsset = {
  id: string;
  title: string;
  niche: string;
  imageUrl: string;
};

function RemixContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assetId = searchParams.get('assetId');

  const [source, setSource] = useState<Asset | null>(null);
  const [loadingSource, setLoadingSource] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [niche, setNiche] = useState('');
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState<number>(1);

  const [loading, setLoading] = useState(false);
  const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) {
      setLoadingSource(false);
      router.replace('/studio/gallery');
      return;
    }

    async function load() {
      setLoadingSource(true);
      const asset = await getAsset(assetId!);
      if (!asset) {
        setSourceError('Asset not found');
      } else {
        setSource(asset);
        setTitle(asset.title ?? '');
        setNiche(asset.niche ?? '');
        setPrompt(asset.prompt ?? '');
      }
      setLoadingSource(false);
    }

    load();
  }, [assetId, router]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }
    setError(null);
    setLoading(true);
    setGeneratedAssets([]);

    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          title: title || prompt.slice(0, 60),
          niche: niche || 'general',
          count,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Generation failed');
      }

      const data = await res.json();
      setGeneratedAssets(data.assets ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* Page header */}
      <div className="border-b border-white/5 px-6 py-4">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">AI Studio</p>
        <h1 className="text-2xl font-black text-primary">Remix</h1>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 flex-col lg:flex-row">

        {/* LEFT: Control panel */}
        <aside className="w-full shrink-0 border-b border-white/5 p-6 lg:w-96 lg:self-start lg:sticky lg:top-16 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-white/10">
          <div className="mb-6 border-b border-white/10">
            <span className="inline-block border-b-2 border-accent pb-2 text-sm font-semibold text-primary">
              Remix
            </span>
          </div>

          {/* Source asset: loading skeleton */}
          {loadingSource && (
            <div className="mb-6 flex flex-col gap-3">
              <div className="aspect-square w-full animate-pulse rounded-lg bg-secondary" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
              <div className="mt-2 border-t border-white/10" />
            </div>
          )}

          {/* Source asset: error */}
          {!loadingSource && sourceError && (
            <div className="mb-6 flex flex-col gap-2">
              <p className="text-sm text-red-400">{sourceError}</p>
              <Link href="/studio/gallery" className="text-xs text-accent hover:underline">
                ← Back to Gallery
              </Link>
            </div>
          )}

          {/* Source asset: thumbnail */}
          {!loadingSource && source && (
            <div className="mb-6">
              <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-white/10 bg-background">
                <Image src={source.imageUrl} alt={source.title} fill className="object-cover" />
              </div>
              <p className="mt-2 truncate text-xs text-muted">{source.title}</p>
              <div className="mt-4 border-t border-white/10" />
            </div>
          )}

          <div className="flex flex-col gap-5">
            <Input
              label="Title"
              placeholder="Name your design…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <Input
              label="Niche"
              placeholder="e.g. 80s-retro, kawaii-animals"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />

            {/* Count */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Number of images</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={count}
                  onChange={(e) =>
                    setCount(Math.min(8, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="h-10 w-20 rounded-md border border-white/20 bg-transparent px-3 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <span className="text-xs text-muted">1–8 images</span>
              </div>
            </div>

            {/* Prompt */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder="No original prompt — write your own."
                className="flex w-full resize-none rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || loadingSource || !!sourceError}
              variant="primary"
              className="w-full"
              size="lg"
            >
              {loading ? `Generating ${count} image(s)…` : 'Generate Remix'}
            </Button>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </aside>

        {/* RIGHT: Results panel */}
        <section className="flex-1 p-6">
          {generatedAssets.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
              <svg
                className="h-10 w-10 text-accent/40"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
              <p className="text-sm font-medium text-primary">Your remixed designs will appear here</p>
              <p className="text-xs text-muted">Edit the prompt and hit Generate Remix</p>
            </div>
          ) : (
            <div>
              <p className="mb-4 text-sm text-muted">
                {generatedAssets.length} design{generatedAssets.length !== 1 ? 's' : ''} generated
              </p>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {generatedAssets.map((asset) => (
                  <article
                    key={asset.id}
                    className="overflow-hidden rounded-lg border border-white/10 bg-secondary"
                  >
                    <div className="relative aspect-square overflow-hidden bg-background">
                      <Image src={asset.imageUrl} alt={asset.title} fill className="object-cover" />
                      <span className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium text-accent">
                        Saved ✓
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-primary">{asset.title}</p>
                      {asset.niche && (
                        <p className="mt-0.5 text-xs text-muted">{asset.niche}</p>
                      )}
                      <Link
                        href={`/studio/apply?assetId=${asset.id}`}
                        className="mt-2 block w-full rounded-md bg-accent/10 px-3 py-1.5 text-center text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
                      >
                        Apply to Product →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function RemixPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="animate-pulse text-sm text-muted">Loading…</p>
        </div>
      }
    >
      <RemixContent />
    </Suspense>
  );
}
