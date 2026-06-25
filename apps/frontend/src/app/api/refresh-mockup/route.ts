import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { getPrintifyMockupUrl } from '@/lib/printify';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { assetId, printifyProductId } = body ?? {};

    if (!assetId || !printifyProductId) {
      return NextResponse.json(
        { error: 'Missing required fields: assetId, printifyProductId' },
        { status: 400 },
      );
    }

    const mockupUrl = await getPrintifyMockupUrl(String(printifyProductId)).catch(() => null);

    if (!mockupUrl) {
      return NextResponse.json(
        { error: 'No mockup image found on Printify for this product' },
        { status: 404 },
      );
    }

    await adminDb.collection('assets').doc(String(assetId)).update({
      mockupUrl,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, mockupUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('refresh-mockup error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
