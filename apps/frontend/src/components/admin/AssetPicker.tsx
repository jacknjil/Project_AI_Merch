'use client';

import React, { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type AssetDoc = {
  id: string;
  title: string;
  imageUrl?: string | null;
  description?: string;
};

type AssetPickerProps = {
  onSelect: (asset: AssetDoc) => void;
  onClose: () => void;
};

export default function AssetPicker({ onSelect, onClose }: AssetPickerProps) {
  const [assets, setAssets] = useState<AssetDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setLoading(true);

        const col = collection(db, 'assets');
        // adjust orderBy as needed depending on your schema
        const q = query(col, orderBy('title', 'asc'));
        const snap = await getDocs(q);

        const items: AssetDoc[] = snap.docs.map((doc) => {
          const data = doc.data() as any;
          const resolvedImageUrl: string | null =
            data.imageUrl ?? data.mockupImageUrl ?? data.url ?? null;

          return {
            id: doc.id,
            title: data.title ?? 'Untitled asset',
            imageUrl: resolvedImageUrl ?? null,
            description: data.description ?? '',
          };
        });

        setAssets(items);
      } catch (err: any) {
        console.error('[AssetPicker] Failed to load assets:', err);
        setError(err?.message ?? 'Failed to load assets');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 'min(900px, 100% - 32px)',
          maxHeight: '80vh',
          background: '#020617',
          borderRadius: 12,
          border: '1px solid #1f2937',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Choose an asset</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid #4b5563',
              background: '#111827',
              color: '#e5e7eb',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </header>

        <p
          style={{
            margin: 0,
            fontSize: '0.85rem',
            color: '#9ca3af',
          }}
        >
          Select an asset to use as this product&apos;s default design (and
          optionally its mockup image).
        </p>

        {loading && (
          <p
            style={{
              margin: 0,
              fontSize: '0.9rem',
              color: '#9ca3af',
            }}
          >
            Loading assets…
          </p>
        )}

        {error && (
          <p
            style={{
              margin: 0,
              fontSize: '0.9rem',
              color: '#fca5a5',
            }}
          >
            {error}
          </p>
        )}

        {!loading && !error && assets.length === 0 && (
          <p
            style={{
              margin: 0,
              fontSize: '0.9rem',
              color: '#9ca3af',
            }}
          >
            No assets found. Create some designs first.
          </p>
        )}

        {!loading && !error && assets.length > 0 && (
          <div
            style={{
              marginTop: 4,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
              }}
            >
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onSelect(asset)}
                  style={{
                    textAlign: 'left',
                    padding: 8,
                    borderRadius: 8,
                    border: '1px solid #1f2937',
                    background: '#020617',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 6,
                      border: '1px solid #374151',
                      overflow: 'hidden',
                      background: '#020617',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {asset.imageUrl ? (
                      <img
                        src={asset.imageUrl}
                        alt={asset.title}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: '#6b7280',
                        }}
                      >
                        No image
                      </span>
                    )}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        marginBottom: 2,
                      }}
                    >
                      {asset.title}
                    </div>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: '#6b7280',
                        wordBreak: 'break-all',
                      }}
                    >
                      {asset.id}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
