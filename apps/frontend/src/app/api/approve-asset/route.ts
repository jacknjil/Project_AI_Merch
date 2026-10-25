import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';

// Firestore doc ids used for assets; rejects path separators and anything exotic.
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Sets or clears the approvedForPublish flag that gates pushing a Printify
 * product to Etsy. Written server-side (Admin SDK) so the flag can't be set
 * by an ordinary signed-in user through the client Firestore rules.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { assetId, approved } = body ?? {};

    if (typeof assetId !== 'string' || !ASSET_ID_PATTERN.test(assetId) || typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'Expected { assetId: string, approved: boolean }' }, { status: 400 });
    }

    const ref = adminDb.collection('assets').doc(assetId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    await ref.update({ approvedForPublish: approved, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, approvedForPublish: approved });
  } catch (err: unknown) {
    console.error('approve-asset error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 });
  }
}
