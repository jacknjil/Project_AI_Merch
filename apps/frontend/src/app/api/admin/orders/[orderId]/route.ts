import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

// 1. Fixed GET: Wrapped params in Promise and awaited it
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;

  const ref = adminDb.collection('orders').doc(orderId);
  const snap = await ref.get();

  if (!snap.exists)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(
    { orderId: snap.id, ...snap.data() },
    { status: 200 },
  );
}

// 2. Fixed PATCH: Wrapped params in Promise and awaited it
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  const ref = adminDb.collection('orders').doc(orderId);

  if (action === 'mark_fulfilled') {
    await ref.set(
      {
        status: 'fulfilled',
        fulfillment: {
          status: 'fulfilled',
          notes: body?.notes ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
