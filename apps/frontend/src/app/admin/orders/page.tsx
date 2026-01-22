/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/admin/orders/page.tsx
import Link from 'next/link';
import { adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

type Order = {
  orderId: string;
  status?: string;
  createdAt?: any;
  amounts?: { subtotalCents?: number; currency?: string };
  customer?: { email?: string | null; name?: string | null };
  fulfillment?: { status?: string; notes?: string | null };
};

export default async function AdminOrdersPage() {
  const snap = await adminDb
    .collection('orders')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const orders: Order[] = snap.docs.map((d) => ({
    orderId: d.id,
    ...(d.data() as any),
  }));

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Orders</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Manual fulfillment MVP. Latest orders first.
      </p>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {orders.map((o) => (
          <div
            key={o.orderId}
            style={{ border: '1px solid #333', borderRadius: 12, padding: 12 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>
                  <Link href={`/admin/orders/${o.orderId}`}>{o.orderId}</Link>
                </div>
                <div style={{ fontSize: 14, opacity: 0.8 }}>
                  {o.customer?.email ?? 'no email'} • status:{' '}
                  {o.status ?? 'unknown'} • fulfillment:{' '}
                  {o.fulfillment?.status ?? 'n/a'}
                </div>
              </div>

              <div style={{ fontSize: 14, opacity: 0.9 }}>
                {o.amounts?.subtotalCents != null
                  ? `$${(o.amounts.subtotalCents / 100).toFixed(2)}`
                  : ''}
                {o.amounts?.currency
                  ? ` ${String(o.amounts.currency).toUpperCase()}`
                  : ''}
              </div>
            </div>
          </div>
        ))}

        {orders.length === 0 && (
          <div style={{ opacity: 0.8, marginTop: 12 }}>No orders yet.</div>
        )}
      </div>
    </div>
  );
}
