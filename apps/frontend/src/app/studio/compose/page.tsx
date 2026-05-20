'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import Konva from 'konva';
import { getAsset } from '@/hooks/useAssets';
import { getProduct } from '@/hooks/useProducts';
import { useCart } from '@/context/CartContext';
import { Asset, Product } from '@/lib/types';
import { Button } from '@/components/ui/Button';

const KonvaComposer = dynamic(
  () => import('@/components/studio/KonvaComposer'),
  { ssr: false },
);

function ComposeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addItem } = useCart();

  const assetId = searchParams.get('assetId');
  const productId = searchParams.get('productId');

  const [asset, setAsset] = useState<Asset | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    if (!assetId || !productId) {
      router.replace('/studio/gallery');
      return;
    }
    Promise.all([getAsset(assetId), getProduct(productId)]).then(([a, p]) => {
      if (!a || !p) {
        router.replace('/studio/gallery');
        return;
      }
      setAsset(a);
      setProduct(p);
      setLoading(false);
    });
  }, [assetId, productId, router]);

  const handleSave = async () => {
    if (!stageRef.current || !asset || !product || !assetId || !productId) return;
    setSaving(true);
    setError(null);
    try {
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
      const res = await fetch('/api/save-mockup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, assetId, productId }),
      });
      if (!res.ok) throw new Error('Save failed');
      const { imageUrl } = await res.json();
      addItem({ ...product, mockupImageUrl: imageUrl }, 1, assetId);
      router.push('/cart');
    } catch {
      setError('Could not save your design. Please try again.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="animate-pulse text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const mockupUrl =
    product?.mockup_base_image ||
    product?.mockupImageUrl ||
    product?.mockup_image_url ||
    product?.imageUrl ||
    '';

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-white/5 px-6 py-4">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">AI Studio</p>
        <h1 className="text-2xl font-black text-primary">Compose Design</h1>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="relative">
          <KonvaComposer
            assetUrl={asset!.imageUrl}
            productMockupUrl={mockupUrl}
            stageRef={stageRef}
          />
          {saving && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60">
              <p className="animate-pulse text-sm text-primary">Saving…</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">{product!.name}</span>
          <button
            onClick={() => router.push(`/studio/apply?assetId=${assetId}`)}
            className="text-xs text-accent underline"
          >
            Change product
          </button>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <Button
          variant="primary"
          size="lg"
          disabled={saving}
          onClick={handleSave}
          className="w-full"
        >
          {saving ? 'Saving…' : 'Save & Add to Cart'}
        </Button>
      </div>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="animate-pulse text-sm text-muted">Loading…</p>
        </div>
      }
    >
      <ComposeContent />
    </Suspense>
  );
}
