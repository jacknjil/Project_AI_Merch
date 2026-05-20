import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Asset } from '@/lib/types';

export function useAssets(count = 20) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'assets'),
          orderBy('createdAt', 'desc'),
          limit(count * 2), // fetch extra to account for hidden assets
        );
        const snap = await getDocs(q);
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Asset);
        setAssets(all.filter((a) => a.published !== false).slice(0, count));
      } catch (err: unknown) {
        console.error('[useAssets]', err);
        setError(err instanceof Error ? err.message : 'Failed to load assets');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [count]);

  return { assets, loading, error };
}

export async function getAsset(id: string): Promise<Asset | null> {
  try {
    const snap = await getDoc(doc(db, 'assets', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Asset;
  } catch (err) {
    console.error('[getAsset]', err);
    return null;
  }
}
