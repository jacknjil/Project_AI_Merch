'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface PreviewItem {
  assetId: string;
  title: string;
  printifyProductId: string;
  mockupUrl: string | null;
}

export default function PrintifyReconcilePage() {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const scan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/printify-reconcile/preview');
      const data = (await res.json()) as { error?: string; orphans?: PreviewItem[] };
      if (!res.ok) throw new Error(data.error ?? 'Scan failed');
      setItems(data.orphans ?? []);
      setScanned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  };

  const archiveRow = async (item: PreviewItem) => {
    setArchivingId(item.assetId);
    setRowErrors((prev) => ({ ...prev, [item.assetId]: '' }));
    try {
      const res = await fetch('/api/printify-reconcile/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: item.assetId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Archive failed');
      setItems((prev) => prev.filter((p) => p.assetId !== item.assetId));
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [item.assetId]: err instanceof Error ? err.message : 'Archive failed',
      }));
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/assets" className="text-sm text-accent underline">
          ← Back to Assets
        </Link>
        <h1 className="mt-2 text-2xl font-black text-primary">Reconcile Printify Deletions</h1>
        <p className="mb-4 text-sm text-muted">
          Finds assets whose Printify product no longer exists (deleted directly on Printify).
        </p>

        <button
          onClick={scan}
          disabled={loading}
          className="rounded-md border border-sky-500/30 px-3 py-1 text-xs font-medium text-sky-400 transition-colors hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Scanning…' : 'Scan for removed products'}
        </button>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {scanned && items.length === 0 && !error && (
          <p className="mt-4 text-sm text-muted">No removed products found.</p>
        )}

        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <div
              key={item.assetId}
              className="flex flex-wrap items-center gap-4 border-b border-white/10 pb-4"
            >
              {item.mockupUrl && (
                <Image
                  src={item.mockupUrl}
                  alt={item.title}
                  width={80}
                  height={80}
                  className="rounded-md object-cover"
                />
              )}
              <div className="min-w-[180px] flex-1">
                <div className="font-medium">{item.title}</div>
                <div className="text-xs text-muted">Printify ID {item.printifyProductId}</div>
              </div>
              <button
                onClick={() => archiveRow(item)}
                disabled={archivingId === item.assetId}
                className="rounded-md border border-red-500/30 px-3 py-1 text-xs font-medium text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {archivingId === item.assetId ? 'Archiving…' : 'Archive'}
              </button>
              {rowErrors[item.assetId] && (
                <p className="w-full text-xs text-red-400">{rowErrors[item.assetId]}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
