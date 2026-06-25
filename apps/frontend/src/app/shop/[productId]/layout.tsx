import type { Metadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ productId: string }>;
}): Promise<Metadata> {
  const { productId } = await params;

  try {
    const snap = await adminDb.collection('assets').doc(productId).get();
    if (!snap.exists) {
      return { title: 'Product — AI Merch' };
    }

    const data = snap.data() as Record<string, unknown>;
    const rawTitle = typeof data.title === 'string' ? data.title : '';
    const title =
      rawTitle && rawTitle !== 'AI generated design'
        ? `${rawTitle} — AI Merch`
        : 'AI Merch Design';

    const mockupUrl = typeof data.mockupUrl === 'string' ? data.mockupUrl : null;

    return {
      title,
      openGraph: {
        title,
        type: 'website',
        ...(mockupUrl ? { images: [{ url: mockupUrl }] } : {}),
      },
    };
  } catch {
    return { title: 'Product — AI Merch' };
  }
}

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
