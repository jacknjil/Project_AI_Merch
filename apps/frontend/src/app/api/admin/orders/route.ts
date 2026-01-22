import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function GET() {
  const snap = await adminDb
    .collection('orders')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const orders = snap.docs.map((d) => ({ orderId: d.id, ...d.data() }));
  return NextResponse.json(orders, { status: 200 });
}
