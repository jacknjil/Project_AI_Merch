'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface MockupImage {
  src: string;
  label: string;
  isDefault: boolean;
}

interface PreviewItem {
  printifyProductId: string;
  title: string;
  blueprintId: number;
  printProviderId: number;
  suggestedCategory?: string;
  mockupImages: MockupImage[];
}

const CATEGORY_OPTIONS = ['shirt', 'hoodie', 'tote', 'mug', 'cup', 'sticker'];

export default function PrintifyImportPage() {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<Record<string, 'import' | 'ignore' | undefined>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const scan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/printify-import/preview');
      const data = (await res.json()) as { error?: string; products?: PreviewItem[] };
      if (!res.ok) throw new Error(data.error ?? 'Scan failed');
      const products = data.products ?? [];
      setItems(products);
      setCategoryDrafts((prev) => {
        const next = { ...prev };
        for (const item of products) {
          if (!(item.printifyProductId in next)) {
            next[item.printifyProductId] = item.suggestedCategory ?? '';
          }
        }
        return next;
      });
      setScanned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  };

  const importRow = async (item: PreviewItem) => {
    const category = categoryDrafts[item.printifyProductId];
    if (!category) return;
    setPendingAction((prev) => ({ ...prev, [item.printifyProductId]: 'import' }));
    setRowErrors((prev) => ({ ...prev, [item.printifyProductId]: '' }));
    try {
      const res = await fetch('/api/printify-import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printifyProductId: item.printifyProductId,
          title: item.title,
          category,
          blueprintId: item.blueprintId,
          printProviderId: item.printProviderId,
          mockupImages: item.mockupImages,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setItems((prev) => prev.filter((p) => p.printifyProductId !== item.printifyProductId));
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [item.printifyProductId]: err instanceof Error ? err.message : 'Import failed',
      }));
    } finally {
      setPendingAction((prev) => ({ ...prev, [item.printifyProductId]: undefined }));
    }
  };

  const ignoreRow = async (item: PreviewItem) => {
    setPendingAction((prev) => ({ ...prev, [item.printifyProductId]: 'ignore' }));
    setRowErrors((prev) => ({ ...prev, [item.printifyProductId]: '' }));
    try {
      const res = await fetch('/api/printify-import/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printifyProductId: item.printifyProductId, title: item.title }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Ignore failed');
      setItems((prev) => prev.filter((p) => p.printifyProductId !== item.printifyProductId));
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [item.printifyProductId]: err instanceof Error ? err.message : 'Ignore failed',
      }));
    } finally {
      setPendingAction((prev) => ({ ...prev, [item.printifyProductId]: undefined }));
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/assets" className="text-sm text-accent underline">
          ← Back to Assets
        </Link>
        <h1 className="mt-2 text-2xl font-black text-primary">Import from Printify</h1>
        <p className="mb-4 text-sm text-muted">
          Finds Printify products with no matching asset in Firestore.
        </p>

        <button
          onClick={scan}
          disabled={loading}
          className="rounded-md border border-sky-500/30 px-3 py-1 text-xs font-medium text-sky-400 transition-colors hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Scanning…' : 'Scan Printify'}
        </button>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {scanned && items.length === 0 && !error && (
          <p className="mt-4 text-sm text-muted">No new Printify products found.</p>
        )}

        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <div
              key={item.printifyProductId}
              className="flex flex-wrap items-center gap-4 border-b border-white/10 pb-4"
            >
              {item.mockupImages[0] && (
                <Image
                  src={item.mockupImages[0].src}
                  alt={item.title}
                  width={80}
                  height={80}
                  className="rounded-md object-cover"
                />
              )}
              <div className="min-w-[180px]">
                <div className="font-medium">{item.title}</div>
                <div className="text-xs text-muted">Blueprint {item.blueprintId}</div>
              </div>
              <select
                value={categoryDrafts[item.printifyProductId] ?? ''}
                onChange={(e) =>
                  setCategoryDrafts((prev) => ({ ...prev, [item.printifyProductId]: e.target.value }))
                }
                className="rounded-md border border-white/20 bg-transparent px-2 py-1 text-sm"
              >
                <option value="">Select category…</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                onClick={() => importRow(item)}
                disabled={!categoryDrafts[item.printifyProductId] || !!pendingAction[item.printifyProductId]}
                className="rounded-md border border-emerald-500/30 px-3 py-1 text-xs font-medium text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pendingAction[item.printifyProductId] === 'import' ? 'Importing…' : 'Import'}
              </button>
              <button
                onClick={() => ignoreRow(item)}
                disabled={!!pendingAction[item.printifyProductId]}
                className="rounded-md border border-white/20 px-3 py-1 text-xs font-medium text-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pendingAction[item.printifyProductId] === 'ignore' ? 'Ignoring…' : 'Ignore'}
              </button>
              {rowErrors[item.printifyProductId] && (
                <p className="w-full text-xs text-red-400">{rowErrors[item.printifyProductId]}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
