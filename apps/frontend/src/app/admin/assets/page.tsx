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
          <Link href="/admin/products" className="text-sm text-accent underline">
            ← Products
          </Link>
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
