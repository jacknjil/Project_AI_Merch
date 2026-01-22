'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import Image from 'next/image';

type AssetDoc = {
  id: string;
  title: string;
  imageUrl: string;
  thumbUrl: string;
  niche?: string;
};

type ProductDoc = {
  id: string;
  name: string;
  base_price?: number;
  mockup_base_image?: string;
  category?: string;
};

export default function AssetDetailPage() {
  const params = useParams<{ assetId: string }>();
  const router = useRouter();
  const assetId = params.assetId;

  const [asset, setAsset] = useState<AssetDoc | null>(null);
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Load asset
        const assetSnap = await getDoc(doc(db, 'assets', assetId));
        if (!assetSnap.exists()) {
          throw new Error('Asset not found');
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aData = assetSnap.data() as any;
        setAsset({
          id: assetSnap.id,
          title: aData.title ?? 'Untitled',
          imageUrl: aData.imageUrl ?? '',
          thumbUrl: aData.thumbUrl ?? '',
          niche: aData.niche,
        });

        // Load products
        const prodSnap = await getDocs(collection(db, 'products'));
        const list: ProductDoc[] = prodSnap.docs.map((d) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = d.data() as any;
          return {
            id: d.id,
            name: p.name ?? 'Unnamed product',
            base_price: p.base_price,
            mockup_base_image: p.mockup_base_image,
            category: p.category,
          };
        });

        setProducts(list);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? 'Error loading asset/products');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [assetId]);

  const handleCustomize = (productId: string) => {
    router.push(`/studio?assetId=${assetId}&productId=${productId}`);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetSrc = asset?.imageUrl || (asset as any)?.thumbUrl || 'mock.png';

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Asset</h1>
        <p>Loading asset & products…</p>
      </main>
    );
  }

  if (error || !asset) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Asset</h1>
        <p style={{ color: 'red' }}>{error ?? 'Asset not found.'}</p>
      </main>
    );
  }
  return (
    <main
      style={{
        padding: 24,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 2fr)',
        gap: 24,
        alignItems: 'flex-start',
      }}
    >
      {/* Left: Asset preview */}
      <div>
        <h1>{asset.title}</h1>
        {asset.niche && (
          <p style={{ color: '#9ca3af', marginTop: 4 }}>Niche: {asset.niche}</p>
        )}

        <div
          style={{
            marginTop: 16,
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid #1f2937',
            maxWidth: 480,
          }}
        >
          {asset.imageUrl ? (
            <Image
              src={assetSrc}
              alt={asset.title}
              style={{ width: '100%', display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                padding: 40,
                textAlign: 'center',
                background: '#111827',
              }}
            >
              No image
            </div>
          )}
        </div>
      </div>

      {/* Right: Product picker */}
      <div>
        <h2>Choose a product</h2>
        {products.length === 0 && <p>No products available.</p>}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
            marginTop: 16,
          }}
        >
          {products.map((p) => (
            <div
              key={p.id}
              style={{
                borderRadius: 12,
                border: '1px solid #1f2937',
                background: '#020617',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  background: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {p.mockup_base_image ? (
                  <Image
                    src={p.mockup_base_image}
                    alt={p.name}
                    fill
                    sizes="max-width: 1024px 50vx, 220px"
                    style={{
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <span>No mockup</span>
                )}
              </div>
              <div style={{ padding: 12, flexGrow: 1 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    marginBottom: 4,
                  }}
                >
                  {p.name}
                </h3>
                {p.base_price != null && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.9rem',
                      color: '#9ca3af',
                    }}
                  >
                    ${p.base_price.toFixed(2)}
                  </p>
                )}
                {p.category && (
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: '0.8rem',
                      color: '#6b7280',
                    }}
                  >
                    {p.category}
                  </p>
                )}
              </div>
              <div style={{ padding: '0 12px 12px' }}>
                <button
                  onClick={() => handleCustomize(p.id)}
                  style={{ width: '100%' }}
                >
                  Customize with this
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
