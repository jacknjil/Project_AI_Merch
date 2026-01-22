'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 700;

const PRINT_RECT = {
  x: 150,
  y: 150,
  width: 300,
  height: 400,
};

type AssetDoc = {
  title?: string;
  imageUrl?: string;
};

type ProductDoc = {
  name?: string;
  description?: string;
  price?: number | string; // <-- allow number OR string from Firestore
  mockupImageUrl?: string | null;
};

type Position = { x: number; y: number };

const CART_KEY = 'aiMerchCart';

function StudioPageInner() {
  const searchParams = useSearchParams();
  const assetId = searchParams.get('assetId');
  const productId = searchParams.get('productId');

  const [asset, setAsset] = useState<AssetDoc | null>(null);
  const [product, setProduct] = useState<ProductDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [designImage, setDesignImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState<Position>({
    x: PRINT_RECT.x + PRINT_RECT.width / 2,
    y: PRINT_RECT.y + PRINT_RECT.height / 2,
  });

  const [addedMessage, setAddedMessage] = useState('');

  // Load asset + product
  useEffect(() => {
    const load = async () => {
      if (!assetId || !productId) {
        setError('Missing assetId or productId in URL.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const assetSnap = await getDoc(doc(db, 'assets', assetId));
        if (!assetSnap.exists()) {
          setError('Asset not found.');
          setLoading(false);
          return;
        }

        const productSnap = await getDoc(doc(db, 'products', productId));
        if (!productSnap.exists()) {
          setError('Product not found.');
          setLoading(false);
          return;
        }

        const aData = assetSnap.data() as any;
        const pData = productSnap.data() as any;

        console.log('[STUDIO] asset data:', aData);
        console.log('[STUDIO] product data:', pData);

        setAsset({
          title: aData.title,
          imageUrl: aData.imageUrl,
        });

        setProduct({
          name: pData.name,
          description: pData.description,
          price: pData.price,
          mockupImageUrl: pData.mockupImageUrl ?? null,
        });
      } catch (err) {
        console.error('[STUDIO] load error:', err);
        setError('Failed to load asset or product.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [assetId, productId]);

  // Load design image
  useEffect(() => {
    if (!asset || !asset.imageUrl) return;

    console.log('[STUDIO] Loading design image from:', asset.imageUrl);

    const img = new window.Image();
    img.src = asset.imageUrl;

    img.onload = () => {
      console.log('[STUDIO] Design image loaded:', img.width, img.height);
      setDesignImage(img);
    };

    img.onerror = () => {
      console.error(
        '[STUDIO] Error loading design image from URL:',
        asset.imageUrl
      );
    };
  }, [asset]);

  const handleReset = () => {
    setScale(1);
    setPos({
      x: PRINT_RECT.x + PRINT_RECT.width / 2,
      y: PRINT_RECT.y + PRINT_RECT.height / 2,
    });
  };

  const handleAddToCart = () => {
    if (!product || !productId) {
      console.error('[STUDIO] No product or productId for Add to cart');
      return;
    }

    // Normalize price
    let priceValue = 0;
    if (product.price !== undefined && product.price !== null) {
      const n = Number(product.price);
      if (!Number.isNaN(n)) {
        priceValue = n;
      }
    }

    const newItem = {
      productId,
      productName: product.name ?? 'Product',
      price: priceValue,
      assetId: assetId ?? null,
      assetTitle: asset?.title ?? '',
      scale,
      position: pos,
      // prefer product.mockupImageUrl, fallback to asset.imageUrl
      mockupImageUrl: asset?.imageUrl || product.mockupImageUrl || null,
    };

    console.log('[STUDIO] New cart item:', newItem);

    try {
      if (typeof window === 'undefined') {
        console.warn('[STUDIO] window undefined; not writing cart');
        return;
      }

      const raw = window.localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];

      console.log('[STUDIO] Existing cart raw:', raw);
      console.log('[STUDIO] Existing cart parsed:', parsed);

      const next = Array.isArray(parsed) ? [...parsed, newItem] : [newItem];

      window.localStorage.setItem(CART_KEY, JSON.stringify(next));

      console.log('[STUDIO] Updated cart:', next);

      setAddedMessage('Added to cart!');
      setTimeout(() => setAddedMessage(''), 2000);
    } catch (err) {
      console.error('[STUDIO] Failed to add to cart:', err);
    }
  };

  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: '#020617',
          color: '#e5e7eb',
          padding: 24,
        }}
      >
        <h1>Studio</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (error || !asset || !product) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: '#020617',
          color: '#e5e7eb',
          padding: 24,
        }}
      >
        <h1>Studio</h1>
        <p style={{ color: '#f87171' }}>{error ?? 'Missing data.'}</p>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#020617',
        color: '#e5e7eb',
        padding: 24,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
        gap: 24,
        alignItems: 'flex-start',
      }}
    >
      {/* LEFT: Canvas + debug preview */}
      <div>
        <h1>Studio</h1>
        <p style={{ fontSize: '0.9rem', color: '#9ca3af' }}>
          Asset: <strong>{asset.title ?? assetId}</strong>
          <br />
          Product: <strong>{product.name ?? productId}</strong>
        </p>

        {/* Debug raw image */}
        {asset.imageUrl && (
          <div style={{ marginBottom: 16 }}>
            <p
              style={{
                fontSize: '0.8rem',
                color: '#9ca3af',
                marginBottom: 4,
              }}
            >
              Debug asset image preview:
            </p>
            <img
              src={asset.imageUrl}
              alt="debug-asset"
              style={{
                maxWidth: 200,
                borderRadius: 8,
                border: '1px solid #374151',
              }}
            />
          </div>
        )}

        <Stage
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{
            border: '1px solid #374151',
            background: '#020617',
          }}
        >
          <Layer>
            <Rect
              x={0}
              y={0}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              fill="#020617"
            />

            <Rect
              x={PRINT_RECT.x}
              y={PRINT_RECT.y}
              width={PRINT_RECT.width}
              height={PRINT_RECT.height}
              stroke="#10b981"
              strokeWidth={2}
              dash={[4, 4]}
            />

            {designImage && (
              <KonvaImage
                image={designImage}
                x={pos.x}
                y={pos.y}
                offsetX={designImage.width / 2}
                offsetY={designImage.height / 2}
                scaleX={scale}
                scaleY={scale}
                draggable
                onDragEnd={(e) => {
                  setPos({ x: e.target.x(), y: e.target.y() });
                }}
              />
            )}
          </Layer>
        </Stage>
      </div>

      {/* RIGHT: Controls */}
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: '1px solid #1f2937',
          background: '#020617',
        }}
      >
        <h2>Controls</h2>

        <div style={{ marginBottom: 16 }}>
          <label>
            Scale: <strong>{scale.toFixed(2)}</strong>
          </label>
          <input
            type="range"
            min={0.2}
            max={1.5}
            step={0.05}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => setPos((p) => ({ ...p, y: p.y - 10 }))}
            style={{ padding: '4px 8px' }}
          >
            Up
          </button>
          <button
            onClick={() => setPos((p) => ({ ...p, y: p.y + 10 }))}
            style={{ padding: '4px 8px' }}
          >
            Down
          </button>
          <button
            onClick={() => setPos((p) => ({ ...p, x: p.x - 10 }))}
            style={{ padding: '4px 8px' }}
          >
            Left
          </button>
          <button
            onClick={() => setPos((p) => ({ ...p, x: p.x + 10 }))}
            style={{ padding: '4px 8px' }}
          >
            Right
          </button>
        </div>

        <button onClick={handleReset} style={{ marginBottom: 12 }}>
          Reset position &amp; scale
        </button>

        <div style={{ marginTop: 16 }}>
          <button onClick={handleAddToCart}>Add to cart</button>
          {addedMessage && (
            <p style={{ color: '#22c55e', marginTop: 8 }}>{addedMessage}</p>
          )}
        </div>

        <p
          style={{
            fontSize: '0.85rem',
            color: '#9ca3af',
            marginTop: 16,
          }}
        >
          For now, cart items are stored in your browser&apos;s localStorage
          under <code>aiMerchCart</code>.
        </p>
      </div>
    </main>
  );
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
          }}
        >
          Loading studio...
        </main>
      }
    >
      <StudioPageInner />
    </Suspense>
  );
}
