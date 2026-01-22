"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const snapshot = await getDocs(collection(db, "products"));
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setProducts(list);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <main>Loading products…</main>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Products</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "16px",
          marginTop: "24px",
        }}
      >
        {products.map((p) => (
          <div
            key={p.id}
            style={{
              background: "#111827",
              borderRadius: "12px",
              overflow: "hidden",
              border: "1px solid #1f2937",
            }}
          >
            <img
              src={p.mockup_base_image}
              alt={p.name}
              style={{
                width: "100%",
                height: "220px",
                objectFit: "cover",
              }}
            />

            <div style={{ padding: 12 }}>
              <h2 style={{ margin: 0, fontSize: "1rem" }}>{p.name}</h2>
              <p style={{ margin: 0, color: "#9ca3af" }}>
                ${p.base_price.toFixed(2)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
