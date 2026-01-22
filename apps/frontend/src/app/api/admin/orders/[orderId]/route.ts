import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { orderId: string } },
) {
  const ref = adminDb.collection('orders').doc(params.orderId);
  const snap = await ref.get();
  if (!snap.exists)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(
    { orderId: snap.id, ...snap.data() },
    { status: 200 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { orderId: string } },
) {
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  const ref = adminDb.collection('orders').doc(params.orderId);

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
