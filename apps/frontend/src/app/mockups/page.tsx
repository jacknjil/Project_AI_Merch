"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";

type MockupDoc = {
  id: string;
  assetId: string;
  productId: string;
  imageUrl: string;
  created_at?: Date | null;
};

export default function MockupsPage() {
  const [mockups, setMockups] = useState<MockupDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState("");
  const [assetFilter, setAssetFilter] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const colRef = collection(db, "mockups");
        const q = query(colRef, orderBy("created_at", "desc"));
        const snap = await getDocs(q);

        const list: MockupDoc[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          let created: Date | null = null;

          if (data.created_at?.toDate) {
            created = data.created_at.toDate();
          } else if (data.created_at instanceof Date) {
            created = data.created_at;
          }

          return {
            id: docSnap.id,
            assetId: data.assetId ?? "",
            productId: data.productId ?? "",
            imageUrl: data.imageUrl,
            created_at: created,
          };
        });

        setMockups(list);
      } catch (err) {
        console.error("Failed to load mockups:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const productOptions = useMemo(() => {
    const set = new Set<string>();
    mockups.forEach((m) => m.productId && set.add(m.productId));
    return Array.from(set).sort();
  }, [mockups]);

  const assetOptions = useMemo(() => {
    const set = new Set<string>();
    mockups.forEach((m) => m.assetId && set.add(m.assetId));
    return Array.from(set).sort();
  }, [mockups]);

  const filteredMockups = useMemo(
    () =>
      mockups.filter((m) => {
        const okProduct =
          !productFilter || m.productId === productFilter;
        const okAsset = !assetFilter || m.assetId === assetFilter;
        return okProduct && okAsset;
      }),
    [mockups, productFilter, assetFilter]
  );

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Mockups</h1>
        <p>Loading mockups…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Mockups</h1>
      <p style={{ color: "#9ca3af", marginBottom: 16 }}>
        All saved mockup images generated from the Studio. Use the
        filters to inspect by product or asset. Each card links back to
        the Studio with the same asset/product.
      </p>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ flex: "0 0 220px", minWidth: 220 }}>
          <label style={{ fontSize: "0.9rem" }}>
            Filter by productId
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              style={{
                marginTop: 4,
                width: "100%",
                padding: 8,
                borderRadius: 8,
                border: "1px solid #1f2937",
                background: "#020617",
                color: "#e5e7eb",
              }}
            >
              <option value="">All products</option>
              {productOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ flex: "0 0 220px", minWidth: 220 }}>
          <label style={{ fontSize: "0.9rem" }}>
            Filter by assetId
            <select
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              style={{
                marginTop: 4,
                width: "100%",
                padding: 8,
                borderRadius: 8,
                border: "1px solid #1f2937",
                background: "#020617",
                color: "#e5e7eb",
              }}
            >
              <option value="">All assets</option>
              {assetOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filteredMockups.length === 0 && (
        <p>No mockups match your filters.</p>
      )}

      {filteredMockups.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {filteredMockups.map((m) => {
            const dateLabel = m.created_at
              ? m.created_at.toLocaleString()
              : "Unknown time";

            const studioUrl = `/studio?assetId=${encodeURIComponent(
              m.assetId
            )}&productId=${encodeURIComponent(m.productId)}`;

            return (
              <div
                key={m.id}
                style={{
                  borderRadius: 12,
                  border: "1px solid #1f2937",
                  background: "#020617",
                  padding: 12,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 8,
                    overflow: "hidden",
                    marginBottom: 8,
                    background: "#111827",
                  }}
                >
                  <img
                    src={m.imageUrl}
                    alt={`Mockup ${m.id}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </div>

                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    color: "#9ca3af",
                    marginBottom: 4,
                  }}
                >
                  mockupId: <code>{m.id}</code>
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.75rem",
                    color: "#9ca3af",
                  }}
                >
                  assetId: <code>{m.assetId}</code>
                  <br />
                  productId: <code>{m.productId}</code>
                </p>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "0.75rem",
                    color: "#6b7280",
                  }}
                >
                  {dateLabel}
                </p>

                <a
                  href={studioUrl}
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    fontSize: "0.8rem",
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #2563eb",
                    color: "#bfdbfe",
                    textDecoration: "none",
                  }}
                >
                  Open in Studio
                </a>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
