'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import FilterBar from '@/components/FilterBar';

type Asset = {
  id: string;
  title?: string;
  imageUrl?: string;
  thumbUrl?: string;
  niche?: string;
  style?: string;
  source?: string;
  createdAt?: Date;
  published?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coerceDate(v: any): Date | undefined {
  if (!v) return undefined;
  if (typeof v?.toDate === 'function') return v.toDate();
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
  const [activeNiche, setActiveNiche] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const q = query(
          collection(db, 'assets'),
          orderBy('createdAt', 'desc'),
          limit(60)
        );

        const snap = await getDocs(q);
        if (cancelled) return;

        const items = snap.docs.map((d) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = d.data() || {};
          const createdAt = coerceDate(data.createdAt ?? data.created_at);

          return {
            id: d.id,
            title: data.title ?? '',
            niche: data.niche ?? '',
            style: data.style ?? '',
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

  const styles = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.style) set.add(a.style);
    return Array.from(set).sort();
  }, [assets]);

  const filtered = useMemo(() => {
    let result = assets;
    if (activeNiche) result = result.filter((a) => a.niche === activeNiche);
    if (activeStyle) result = result.filter((a) => a.style === activeStyle);
    return result;
  }, [assets, activeNiche, activeStyle]);

  function handleFilterChange(key: 'niche' | 'style', value: string | null) {
    if (key === 'niche') setActiveNiche(value);
    else setActiveStyle(value);
  }

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
          <FilterBar
            filters={[
              { key: 'niche', label: 'Niche', values: niches },
              { key: 'style', label: 'Style', values: styles },
            ]}
            active={{ niche: activeNiche, style: activeStyle }}
            onChange={handleFilterChange}
          />

          {filtered.length === 0 && (
            <p style={{ color: '#6b7280' }}>No assets match the selected filters.</p>
          )}

          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            }}
          >
            {filtered.map((asset) => {
              const src = asset.thumbUrl || asset.imageUrl || '/mock.png';
              return (
                <Link
                  key={asset.id}
                  href={`/asset/${asset.id}`}
                  style={{
                    border: '1px solid #1f2937',
                    borderRadius: 12,
                    overflow: 'hidden',
                    textDecoration: 'none',
                    color: 'inherit',
                    background: '#111827',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#374151')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1f2937')}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1 / 1',
                      background: '#020617',
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

                  <div style={{ padding: '10px 12px 12px' }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.3 }}>
                      {asset.title || 'Untitled'}
                    </p>

                    {(asset.niche || asset.style) && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {asset.niche && (
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: '#0c2a31',
                            color: '#a5f3fc',
                            border: '1px solid #164e63',
                          }}>
                            {asset.niche}
                          </span>
                        )}
                        {asset.style && (
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: '#1e1b4b',
                            color: '#c4b5fd',
                            border: '1px solid #312e81',
                          }}>
                            {asset.style}
                          </span>
                        )}
                      </div>
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
