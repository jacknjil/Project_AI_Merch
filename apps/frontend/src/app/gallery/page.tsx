'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';

type Asset = {
  id: string;
  title?: string;
  imageUrl?: string;
  thumbUrl?: string;
  niche?: string;
  source?: string;
  createdAt?: Date;
  published?: boolean; // optional future use
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coerceDate(v: any): Date | undefined {
  if (!v) return undefined;
  if (typeof v?.toDate === 'function') return v.toDate(); // Firestore Timestamp
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

export default function GalleryPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const q = query(
          collection(db, 'assets'),
          // In early stages, keep the gallery lightweight.
          orderBy('createdAt', 'desc'),
          limit(60)
        );

        const snap = await getDocs(q);
        if (cancelled) return;

        const items = snap.docs.map((d) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = d.data() || {};
          const createdAt = coerceDate(data.createdAt ?? data.created_at); // back-compat

          return {
            id: d.id,
            title: data.title ?? '',
            niche: data.niche ?? '',
            imageUrl: data.imageUrl ?? '',
            thumbUrl: data.thumbUrl ?? data.imageUrl ?? '',
            source: data.source ?? '',
            published: data.published,
            createdAt,
          } satisfies Asset;
        });

        setAssets(items);
      } catch (e) {
        console.error('Failed to load gallery assets:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const niches = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.niche) set.add(a.niche);
    return Array.from(set).sort();
  }, [assets]);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Gallery
      </h1>

      {loading && <p style={{ color: '#6b7280' }}>Loading…</p>}

      {!loading && assets.length === 0 && (
        <p style={{ color: '#6b7280' }}>
          No assets yet. (If you later add a <code>published</code> filter, make
          sure at least one asset has <code>published: true</code>.)
        </p>
      )}

      {!loading && assets.length > 0 && (
        <>
          {niches.length > 0 && (
            <div
              style={{
                marginBottom: 16,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              {niches.map((n) => (
                <span
                  key={n}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: '#f3f4f6',
                    color: '#111827',
                  }}
                >
                  {n}
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            }}
          >
            {assets.map((asset) => {
              const src = asset.thumbUrl || asset.imageUrl || '/mock.png';
              return (
                <Link
                  key={asset.id}
                  href={`/asset/${asset.id}`}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    overflow: 'hidden',
                    textDecoration: 'none',
                    color: 'inherit',
                    background: '#fff',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1 / 1',
                      background: '#f3f4f6',
                    }}
                  >
                    <Image
                      src={src}
                      alt={asset.title || 'Generated design'}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      style={{ objectFit: 'cover' }}
                    />
                  </div>

                  <div style={{ padding: 12 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {asset.title || 'Untitled'}
                    </p>

                    {asset.niche && (
                      <p
                        style={{
                          margin: '4px 0 0 0',
                          fontSize: '0.85rem',
                          color: '#6b7280',
                        }}
                      >
                        {asset.niche}
                      </p>
                    )}

                    {asset.createdAt && (
                      <p
                        style={{
                          margin: '6px 0 0 0',
                          fontSize: '0.75rem',
                          color: '#9ca3af',
                        }}
                      >
                        {asset.createdAt.toLocaleString()}
                      </p>
                    )}

                    {asset.source && (
                      <p
                        style={{
                          margin: '4px 0 0 0',
                          fontSize: '0.75rem',
                          color: '#6b7280',
                        }}
                      >
                        Source: {asset.source}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
