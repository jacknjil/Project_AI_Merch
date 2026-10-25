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
import { useAuthContext } from '@/context/AuthContext';

const PUBLISH_BLOCK_NOTICES: Record<string, string> = {
  'asset-not-approved': 'Created as a Printify draft. Not on Etsy: this design is not approved.',
  'publishing-disabled': 'Created as a Printify draft. Not on Etsy: publishing is switched off on the server.',
};

export default function AdminAssetsPage() {
  const { user } = useAuthContext();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowNotices, setRowNotices] = useState<Record<string, string>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [refreshingMockupId, setRefreshingMockupId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number } | null>(null);
  const [groupIdDrafts, setGroupIdDrafts] = useState<Record<string, string>>({});

  const saveDesignGroupId = async (asset: Asset, value: string) => {
    const trimmed = value.trim();
    setRowErrors((prev) => ({ ...prev, [asset.id]: '' }));
    setAssets((prev) =>
      prev.map((a) => (a.id === asset.id ? { ...a, designGroupId: trimmed || undefined } : a)),
    );
    try {
      await updateDoc(doc(db, 'assets', asset.id), { designGroupId: trimmed || null });
    } catch {
      setRowErrors((prev) => ({ ...prev, [asset.id]: 'Failed to save group id.' }));
    }
  };

  const setApprovedForPublish = async (asset: Asset, approved: boolean) => {
    setRowErrors((prev) => ({ ...prev, [asset.id]: '' }));
    setAssets((prev) =>
      prev.map((a) => (a.id === asset.id ? { ...a, approvedForPublish: approved } : a)),
    );
    try {
      // Approval is written server-side: client Firestore rules deny writes to this field.
      if (!user) throw new Error('Sign in as an admin to approve');
      const token = await user.getIdToken();
      const res = await fetch('/api/approve-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assetId: asset.id, approved }),
      });
      if (!res.ok) throw new Error(`Approval failed (${res.status})`);
    } catch {
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, approvedForPublish: !approved } : a)),
      );
      setRowErrors((prev) => ({ ...prev, [asset.id]: 'Failed to save approval.' }));
    }
  };

  const publishToPrintify = async (asset: Asset) => {
    if (!asset.imageUrl) return;
    setPublishingId(asset.id);
    setRowErrors((prev) => ({ ...prev, [asset.id]: '' }));
    try {
      // The publish route requires an allowlisted admin's Firebase ID token.
      if (!user) throw new Error('Sign in as an admin to publish');
      const token = await user.getIdToken();
      const res = await fetch('/api/publish-to-printify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assetId: asset.id }),
      });
      const data = await res.json() as {
        error?: string;
        printifyProductId?: string;
        printifyStatus?: string;
        publishWarning?: string;
        publishBlockedReason?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Publish failed');
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? { ...a, printifyProductId: data.printifyProductId, printifyStatus: data.printifyStatus }
            : a,
        ),
      );
      if (data.publishBlockedReason) {
        setRowNotices((prev) => ({
          ...prev,
          [asset.id]: PUBLISH_BLOCK_NOTICES[data.publishBlockedReason ?? ''] ?? 'Created as a Printify draft; not published to Etsy.',
        }));
      }
      if (data.publishWarning) {
        setRowErrors((prev) => ({ ...prev, [asset.id]: data.publishWarning ?? '' }));
      }
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
      const data = await res.json() as { error?: string; mockupUrl?: string; mockupImages?: Asset['mockupImages'] };
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed');
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id ? { ...a, mockupUrl: data.mockupUrl, mockupImages: data.mockupImages } : a,
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

  const restore = async (asset: Asset) => {
    setRestoringId(asset.id);
    setRowErrors((prev) => ({ ...prev, [asset.id]: '' }));
    try {
      const res = await fetch('/api/printify-reconcile/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Restore failed');
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id ? { ...a, printifyStatus: 'published', archivedAt: undefined } : a,
        ),
      );
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [asset.id]: err instanceof Error ? err.message : 'Restore failed',
      }));
    } finally {
      setRestoringId(null);
    }
  };

  const backfillAllMockups = async () => {
    const pending = assets.filter((a) => a.printifyProductId && !a.mockupImages?.length);
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
        const data = await res.json() as { error?: string; mockupUrl?: string; mockupImages?: Asset['mockupImages'] };
        if (res.ok && data.mockupUrl) {
          setAssets((prev) =>
            prev.map((a) => (a.id === asset.id ? { ...a, mockupUrl: data.mockupUrl, mockupImages: data.mockupImages } : a)),
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
              disabled={backfilling || assets.filter((a) => a.printifyProductId && !a.mockupImages?.length).length === 0}
              className="rounded-md border border-sky-500/30 px-3 py-1 text-xs font-medium text-sky-400 transition-colors hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {backfilling ? 'Backfilling…' : 'Backfill All Mockups'}
            </button>
            <Link href="/admin/printify-import" className="text-sm text-accent underline">
              Import from Printify →
            </Link>
            <Link href="/admin/printify-reconcile" className="text-sm text-accent underline">
              Reconcile Deletions →
            </Link>
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
                  {rowNotices[asset.id] && (
                    <p className="text-xs text-muted">{rowNotices[asset.id]}</p>
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
                ) : asset.printifyStatus === 'created' ? (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                    Draft on Printify
                  </span>
                ) : asset.printifyStatus === 'archived' ? (
                  <>
                    <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-muted">
                      Archived
                    </span>
                    <button
                      onClick={() => restore(asset)}
                      disabled={restoringId === asset.id}
                      className="shrink-0 rounded-md border border-white/20 px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {restoringId === asset.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </>
                ) : (
                  <>
                  <label className="flex shrink-0 items-center gap-1 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={asset.approvedForPublish === true}
                      onChange={(e) => setApprovedForPublish(asset, e.target.checked)}
                    />
                    Approve for Etsy
                  </label>
                  <button
                    onClick={() => publishToPrintify(asset)}
                    disabled={publishingId === asset.id || !asset.imageUrl}
                    className="shrink-0 rounded-md border border-violet-500/30 px-3 py-1 text-xs font-medium text-violet-400 transition-colors hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {publishingId === asset.id ? 'Publishing…' : 'Publish to Printify'}
                  </button>
                  </>
                )}

                {asset.printifyProductId && (
                  <button
                    onClick={() => refreshMockup(asset)}
                    disabled={refreshingMockupId === asset.id}
                    className="shrink-0 rounded-md border border-sky-500/30 px-3 py-1 text-xs font-medium text-sky-400 transition-colors hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {refreshingMockupId === asset.id ? 'Refreshing…' : 'Refresh Mockup'}
                  </button>
                )}

                <input
                  type="text"
                  placeholder="Group ID"
                  title="Set the same value on sibling assets (e.g. shirt + hoodie of the same design) to link them as a product-type switcher on the shop page"
                  value={groupIdDrafts[asset.id] ?? asset.designGroupId ?? ''}
                  onChange={(e) =>
                    setGroupIdDrafts((prev) => ({ ...prev, [asset.id]: e.target.value }))
                  }
                  onBlur={(e) => saveDesignGroupId(asset, e.target.value)}
                  className="w-24 shrink-0 rounded-md border border-white/10 bg-background px-2 py-1 text-xs text-primary placeholder:text-muted"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
