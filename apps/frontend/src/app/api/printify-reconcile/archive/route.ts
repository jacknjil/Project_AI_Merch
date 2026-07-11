import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { assetId } = body ?? {};

    if (!assetId) {
      return NextResponse.json(
        { error: 'Missing required field: assetId' },
        { status: 400 },
      );
    }

    const ref = adminDb.collection('assets').doc(String(assetId));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: `Asset not found: ${assetId}` }, { status: 400 });
    }

    await ref.set(
      { printifyStatus: 'archived', archivedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-reconcile/archive error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
