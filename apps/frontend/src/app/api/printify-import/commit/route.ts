import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

interface MockupImage {
  src: string;
  label: string;
  isDefault: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { printifyProductId, title, category, blueprintId, printProviderId, mockupImages } = body ?? {};

    if (!printifyProductId || !title || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: printifyProductId, title, category' },
        { status: 400 },
      );
    }

    const images: MockupImage[] = Array.isArray(mockupImages) ? mockupImages : [];
    const mockupUrl = images.find((img) => img.isDefault)?.src ?? images[0]?.src ?? null;

    const docRef = await adminDb.collection('assets').add({
      title: String(title),
      productCategory: String(category),
      printifyProductId: String(printifyProductId),
      printifyStatus: 'published',
      printifyBlueprintId: blueprintId != null ? Number(blueprintId) : null,
      printifyPrintProviderId: printProviderId != null ? Number(printProviderId) : null,
      mockupImages: images,
      mockupUrl,
      imageUrl: mockupUrl ?? '',
      importSource: 'printify-import',
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, assetId: docRef.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-import/commit error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
