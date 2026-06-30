'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Asset } from '@/lib/types';

export default function AdminAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [refreshingMockupId, setRefreshingMockupId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number } | null>(null);

  const publishToPrintify = async (asset: Asset) => {
    if (!asset.imageUrl) return;
    setPublishingId(asset.id);
    setRowErrors((prev) => ({ ...prev, [asset.id]: '' }));
    try {
      const res = await fetch('/api/publish-to-printify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: asset.id,
          imageUrl: asset.imageUrl,
          title: asset.title,
          productCategory: asset.productCategory ?? 'shirt',
          niche: asset.niche,
        }),
      });
      const data = await res.json() as { error?: string; printifyProductId?: string };
      if (!res.ok) throw new Error(data.error ?? 'Publish failed');
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? { ...a, printifyProductId: data.printifyProductId, printifyStatus: 'published' }
            : a,
        ),
      );
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [asset.id]: err instanceof Error ? err.message : 'Publish failed',
      }));
    } finally {
      setPublishingId(null);
    }
  };

  const refreshMockup = async (asset: Asset) => {
    if (!asset.printifyProductId) return;
    setRefreshingMockupId(asset.id);
    setRowErrors((prev) => ({ ...prev, [asset.id]: '' }));
    try {
      const res = await fetch('/api/refresh-mockup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id, printifyProductId: asset.printifyProductId }),
      });
      const data = await res.json() as { error?: string; mockupUrl?: string };
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed');
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id ? { ...a, mockupUrl: data.mockupUrl } : a,
        ),
      );
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [asset.id]: err instanceof Error ? err.message : 'Refresh failed',
      }));
    } finally {
      setRefreshingMockupId(null);
    }
  };

  const backfillAllMockups = async () => {
    const pending = assets.filter((a) => a.printifyProductId && !a.mockupUrl);
    if (pending.length === 0) return;
    setBackfilling(true);
    setBackfillProgress({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i++) {
      const asset = pending[i];
      try {
        const res = await fetch('/api/refresh-mockup', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: asset.id, printifyProductId: asset.printifyProductId }),
        });
        const data = await res.json() as { error?: string; mockupUrl?: string };
        if (res.ok && data.mockupUrl) {
          setAssets((prev) =>
            prev.map((a) => (a.id === asset.id ? { ...a, mockupUrl: data.mockupUrl } : a)),
          );
        }
      } catch {
        // non-fatal — continue to next asset
      }
      setBackfillProgress({ done: i + 1, total: pending.length });
    }
    setBackfilling(false);
    setBackfillProgress(null);
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, 'assets'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Asset));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load assets');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggle = async (asset: Asset) => {
    const isPublished = asset.published !== false;
    const newValue = !isPublished;

    setAssets((prev) =>
      prev.map((a) => (a.id === asset.id ? { ...a, published: newValue } : a)),
    );
    setRowErrors((prev) => ({ ...prev, [asset.id]: '' }));

    try {
      await updateDoc(doc(db, 'assets', asset.id), { published: newValue });
    } catch {
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id ? { ...a, published: asset.published } : a,
        ),
      );
      setRowErrors((prev) => ({
        ...prev,
        [asset.id]: 'Update failed. Try again.',
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="animate-pulse text-sm text-muted">Loading assets…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-primary">Assets</h1>
            <p className="text-sm text-muted">
              Toggle visibility in the customer gallery.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {backfillProgress && (
              <span className="text-xs text-muted">
                {backfillProgress.done}/{backfillProgress.total} mockups…
              </span>
            )}
            <button
              onClick={backfillAllMockups}
              disabled={backfilling || assets.filter((a) => a.printifyProductId && !a.mockupUrl).length === 0}
              className="rounded-md border border-sky-500/30 px-3 py-1 text-xs font-medium text-sky-400 transition-colors hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {backfilling ? 'Backfilling…' : 'Backfill All Mockups'}
            </button>
            <Link href="/admin/products" className="text-sm text-accent underline">
              ← Products
            </Link>
          </div>
        </header>

        {error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {!error && assets.length === 0 && (
          <p className="text-sm text-muted">No assets found.</p>
        )}

        <div className="flex flex-col gap-2">
          {assets.map((asset) => {
            const isPublished = asset.published !== false;
            return (
              <div
                key={asset.id}
                className="flex items-center gap-4 rounded-lg border border-white/10 bg-secondary p-3"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-background">
                  {asset.imageUrl ? (
                    <Image
                      src={asset.imageUrl}
                      alt={asset.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">
                      No image
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-primary">
                    {asset.title}
                  </p>
                  {asset.niche && (
                    <p className="text-xs text-muted">{asset.niche}</p>
                  )}
                  {rowErrors[asset.id] && (
                    <p className="text-xs text-red-400">{rowErrors[asset.id]}</p>
                  )}
                </div>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    isPublished
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-white/5 text-muted'
                  }`}
                >
                  {isPublished ? 'Published' : 'Hidden'}
                </span>

                <button
                  onClick={() => toggle(asset)}
                  className={`shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                    isPublished
                      ? 'border-white/20 text-muted hover:border-red-500/50 hover:text-red-400'
                      : 'border-accent/30 text-accent hover:border-accent'
                  }`}
                >
                  {isPublished ? 'Hide' : 'Publish'}
                </button>

                {asset.printifyStatus === 'published' ? (
                  <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">
                    On Etsy
                  </span>
                ) : (
                  <button
                    onClick={() => publishToPrintify(asset)}
                    disabled={publishingId === asset.id || !asset.imageUrl}
                    className="shrink-0 rounded-md border border-violet-500/30 px-3 py-1 text-xs font-medium text-violet-400 transition-colors hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {publishingId === asset.id ? 'Publishing…' : 'Publish to Printify'}
                  </button>
                )}

                {asset.printifyProductId && !asset.mockupUrl && (
                  <button
                    onClick={() => refreshMockup(asset)}
                    disabled={refreshingMockupId === asset.id}
                    className="shrink-0 rounded-md border border-sky-500/30 px-3 py-1 text-xs font-medium text-sky-400 transition-colors hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {refreshingMockupId === asset.id ? 'Refreshing…' : 'Refresh Mockup'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
