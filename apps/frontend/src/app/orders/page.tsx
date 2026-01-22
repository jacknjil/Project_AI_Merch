"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { useAnonUser } from "@/lib/useAnonUser";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";

type CartItem = {
  id: string;
  assetId: string;
  productId: string;
  assetTitle: string;
  productName: string;
  assetImageUrl: string;
  mockupImageUrl?: string | null;
  position: { x: number; y: number };
  scale: number;
  print_area: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  quantity: number;
};

type OrderDoc = {
  id: string;
  userId: string | null;
  created_at: Date | null;
  payment_status: string;
  total_amount: number;
  items: CartItem[];
  payment_confirmed?: boolean; // derived from stripe_events
};

export default function OrdersPage() {
  const { user, initializing } = useAnonUser();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initializing) return;

    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // 1) Load orders for this user
        const ordersRef = collection(db, "orders");
        const ordersQuery = query(
          ordersRef,
          where("userId", "==", user.uid),
          orderBy("created_at", "desc")
        );
        const ordersSnap = await getDocs(ordersQuery);

        const rawOrders: OrderDoc[] = ordersSnap.docs.map((d) => {
          const data = d.data() as any;
          const created =
            data.created_at?.toDate?.() ?? data.created_at ?? null;

          return {
            id: d.id,
            userId: data.userId ?? null,
            created_at: created,
            payment_status: data.payment_status ?? "unknown",
            total_amount: data.total_amount ?? 0,
            items: (data.items ?? []) as CartItem[],
          };
        });

        // 2) Load Stripe events for this user
        const stripeRef = collection(db, "stripe_events");
        const stripeQuery = query(
          stripeRef,
          where("userId", "==", user.uid)
        );
        const stripeSnap = await getDocs(stripeQuery);

        const confirmedItemIds = new Set<string>();

        stripeSnap.docs.forEach((doc) => {
          const data = doc.data() as any;
          const ids: string[] = data.cartItemIds ?? [];
          ids.forEach((id) => confirmedItemIds.add(id));
        });

        // 3) Mark orders as payment_confirmed if any item id
        //    exists in confirmedItemIds
        const enhancedOrders: OrderDoc[] = rawOrders.map((order) => {
          const confirmed = order.items.some((item) =>
            confirmedItemIds.has(item.id)
          );
          return { ...order, payment_confirmed: confirmed };
        });

        setOrders(enhancedOrders);
      } catch (err) {
        console.error("Failed to load orders or stripe events:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [initializing, user]);

  if (initializing || loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Orders</h1>
        <p>Loading your orders…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Orders</h1>
        <p>Could not establish a user session.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Orders</h1>

      {orders.length === 0 && <p>You don&apos;t have any orders yet.</p>}

      {orders.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
            marginTop: 16,
          }}
        >
          {orders.map((order) => {
            const dateLabel = order.created_at
              ? order.created_at.toLocaleString()
              : "Unknown date";

            const statusLabel =
              order.payment_status === "paid"
                ? order.payment_confirmed
                  ? "PAID (confirmed)"
                  : "PAID"
                : order.payment_status.toUpperCase();

            const statusColor =
              order.payment_status === "paid"
                ? order.payment_confirmed
                  ? "#22c55e"
                  : "#facc15"
                : "#f97316";

            return (
              <div
                key={order.id}
                style={{
                  borderRadius: 12,
                  border: "1px solid #1f2937",
                  background: "#020617",
                  padding: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: "1rem",
                      }}
                    >
                      Order #{order.id.slice(0, 8)}
                    </h2>
                    <p
                      style={{
                        margin: "4px 0",
                        fontSize: "0.85rem",
                        color: "#9ca3af",
                      }}
                    >
                      {dateLabel}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 600,
                        color: statusColor,
                      }}
                    >
                      {statusLabel}
                    </p>
                    <p
                      style={{
                        margin: "4px 0",
                        fontSize: "0.9rem",
                      }}
                    >
                      ${order.total_amount.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    borderTop: "1px solid #1f2937",
                    marginTop: 8,
                    paddingTop: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {order.items.map((item, idx) => (
                    <div
                      key={item.id ?? idx}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          overflow: "hidden",
                          background: "#111827",
                          flexShrink: 0,
                        }}
                      >
                        { (item as any).mockupImageUrl || item.assetImageUrl ? (
                        <img
                          src={(item as any).mockupImageUrl || item.assetImageUrl}
                          alt={item.assetTitle}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",   
                        }}
                      />
                        ) : (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "#6b7280",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              height: "100%",
                            }}
                          >
                            No preview
                          </span>
                        )}
                      </div>
                      <div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.9rem",
                          }}
                        >
                          {item.productName}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.8rem",
                            color: "#9ca3af",
                          }}
                        >
                          {item.assetTitle}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.75rem",
                            color: "#6b7280",
                          }}
                        >
                          Qty: {item.quantity ?? 1}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
