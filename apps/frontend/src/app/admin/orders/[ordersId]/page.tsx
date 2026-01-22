/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/admin/orders/[orderId]/page.tsx
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function markFulfilled(orderId: string) {
  'use server';
  await adminDb
    .collection('orders')
    .doc(orderId)
    .set(
      {
        status: 'fulfilled',
        fulfillment: {
          status: 'fulfilled',
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  redirect(`/admin/orders/${orderId}`);
}

export default async function AdminOrderDetail({
  params,
}: {
  params: { orderId: string };
}) {
  const snap = await adminDb.collection('orders').doc(params.orderId).get();
  if (!snap.exists) return <div style={{ padding: 24 }}>Order not found.</div>;

  const order = { orderId: snap.id, ...(snap.data() as any) };

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>{params.orderId}</h1>
          <div style={{ opacity: 0.8 }}>
            status: {order.status} • fulfillment: {order.fulfillment?.status}
          </div>
        </div>

        <form action={markFulfilled.bind(null, params.orderId)}>
          <button
            type="submit"
            style={{ padding: '10px 12px', borderRadius: 10 }}
          >
            Mark fulfilled
          </button>
        </form>
      </div>

      <pre
        style={{
          marginTop: 16,
          padding: 12,
          borderRadius: 12,
          border: '1px solid #333',
          overflowX: 'auto',
        }}
      >
        {JSON.stringify(order, null, 2)}
      </pre>
    </div>
  );
}
