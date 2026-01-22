"use client";

import React, { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import AssetPicker, {
  AssetDoc,
} from "@/components/admin/AssetPicker";

type ProductState = {
  name: string;
  description: string;
  priceInput: string;
  mockupImageUrl: string;
  defaultAssetId: string;
  active: boolean;
};

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.productId as string;

  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [product, setProduct] = useState<ProductState | null>(null);

  // Asset picker state
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetDoc | null>(
    null
  );

  // Load product once
  useEffect(() => {
    const load = async () => {
      if (!productId) return;
      try {
        setError(null);
        setLoading(true);

        const ref = doc(db, "products", productId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Product not found.");
          setProduct(null);
          return;
        }

        const data = snap.data() as any;

        const state: ProductState = {
          name: data.name ?? "",
          description: data.description ?? "",
          priceInput:
            typeof data.price === "number"
              ? String(data.price)
              : "",
          mockupImageUrl: data.mockupImageUrl ?? "",
          defaultAssetId: data.defaultAssetId ?? "",
          active:
            typeof data.active === "boolean" ? data.active : true,
        };

        setProduct(state);

        // If there's a defaultAssetId, keep it as text; we'll let
        // the user re-select if they want to load its full info.
        setSelectedAsset(null);

        setLoaded(true);
      } catch (err: any) {
        console.error("[ADMIN] Error loading product:", err);
        setError(err?.message ?? "Failed to load product.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [productId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!product) return;

    setError(null);

    const priceNumber = parseFloat(product.priceInput);
    if (!product.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      setError("Price must be a non-negative number.");
      return;
    }

    try {
      setSaving(true);

      const ref = doc(db, "products", productId);
      await updateDoc(ref, {
        name: product.name.trim(),
        description: product.description.trim(),
        price: priceNumber,
        mockupImageUrl: product.mockupImageUrl.trim() || null,
        defaultAssetId: product.defaultAssetId.trim() || null,
        active: product.active,
        updatedAt: serverTimestamp(),
      });

      console.log("[ADMIN] Updated product:", productId);
      // optional: small toast / navigate
      // router.push("/admin/products");
    } catch (err: any) {
      console.error("[ADMIN] Error updating product:", err);
      setError(err?.message ?? "Failed to update product.");
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (
    field: keyof ProductState,
    value: string | boolean
  ) => {
    setProduct((prev) =>
      prev
        ? {
            ...prev,
            [field]: value,
          }
        : prev
    );
  };

  const handleAssetSelected = (asset: AssetDoc) => {
    setSelectedAsset(asset);
    setProduct((prev) =>
      prev
        ? {
            ...prev,
            defaultAssetId: asset.id,
            // If no mockup yet, use asset image as a sensible default
            mockupImageUrl:
              prev.mockupImageUrl || asset.imageUrl || "",
          }
        : prev
    );
    setAssetPickerOpen(false);
  };

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#020617",
          color: "#e5e7eb",
          padding: 24,
        }}
      >
        <h1>Loading product…</h1>
      </main>
    );
  }

  if (!loaded || !product) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#020617",
          color: "#e5e7eb",
          padding: 24,
        }}
      >
        <h1>Product not found</h1>
        {error && (
          <p
            style={{
              fontSize: "0.9rem",
              color: "#fca5a5",
            }}
          >
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => router.push("/admin/products")}
          style={{
            marginTop: 8,
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #4b5563",
            background: "#111827",
            color: "#e5e7eb",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          Back to products
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Edit Product</h1>
            <p
              style={{
                margin: 0,
                marginTop: 4,
                fontSize: "0.9rem",
                color: "#9ca3af",
              }}
            >
              ID: <code>{productId}</code>
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin/products")}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #4b5563",
              background: "#111827",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Back to products
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid #1f2937",
            background: "#020617",
            display: "grid",
            gap: 16,
          }}
        >
          {/* Name */}
          <div>
            <label
              style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}
            >
              Name <span style={{ color: "#f97316" }}>*</span>
            </label>
            <input
              type="text"
              value={product.name}
              onChange={(e) =>
                handleFieldChange("name", e.target.value)
              }
              required
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #4b5563",
                background: "#020617",
                color: "#e5e7eb",
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label
              style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}
            >
              Description
            </label>
            <textarea
              value={product.description}
              onChange={(e) =>
                handleFieldChange("description", e.target.value)
              }
              rows={3}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #4b5563",
                background: "#020617",
                color: "#e5e7eb",
                resize: "vertical",
              }}
            />
          </div>

          {/* Price */}
          <div>
            <label
              style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}
            >
              Price (USD){" "}
              <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}>
                e.g. 19.99
              </span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={product.priceInput}
              onChange={(e) =>
                handleFieldChange("priceInput", e.target.value)
              }
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #4b5563",
                background: "#020617",
                color: "#e5e7eb",
              }}
            />
          </div>

          {/* Mockup image URL + preview */}
          <div>
            <label
              style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}
            >
              Mockup image URL (optional)
            </label>
            <input
              type="url"
              value={product.mockupImageUrl}
              onChange={(e) =>
                handleFieldChange("mockupImageUrl", e.target.value)
              }
              placeholder="https://firebasestorage.googleapis.com/..."
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #4b5563",
                background: "#020617",
                color: "#e5e7eb",
              }}
            />
            <p
              style={{
                margin: 0,
                marginTop: 4,
                fontSize: "0.8rem",
                color: "#9ca3af",
              }}
            >
              Used as the main product preview image in Shop/Admin. You
              can paste a Storage URL or derive it from an asset or
              mockup.
            </p>

            {product.mockupImageUrl && (
              <div
                style={{
                  marginTop: 8,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #374151",
                  background: "#020617",
                  display: "inline-block",
                }}
              >
                <img
                  src={product.mockupImageUrl}
                  alt="Mockup preview"
                  onError={(e) =>
                    console.error(
                      "[ADMIN] Mockup preview failed to load:",
                      e.currentTarget.src
                    )
                  }
                  style={{
                    maxWidth: 260,
                    maxHeight: 260,
                    borderRadius: 6,
                    display: "block",
                  }}
                />
              </div>
            )}
          </div>

          {/* Default asset ID + chooser */}
          <div>
            <label
              style={{ display: "block", marginBottom: 4, fontSize: "0.9rem" }}
            >
              Default asset (optional)
            </label>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <input
                type="text"
                value={product.defaultAssetId}
                onChange={(e) =>
                  handleFieldChange("defaultAssetId", e.target.value)
                }
                placeholder="Asset ID (can also choose below)"
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #4b5563",
                  background: "#020617",
                  color: "#e5e7eb",
                }}
              />
              <button
                type="button"
                onClick={() => setAssetPickerOpen(true)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #3b82f6",
                  background: "#0b1120",
                  color: "#bfdbfe",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  whiteSpace: "nowrap",
                }}
              >
                Choose from assets…
              </button>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                color: "#9ca3af",
              }}
            >
              Links this product to an asset in your <code>assets</code>{" "}
              collection so Studio can use it as the default design.
            </p>

            {selectedAsset && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #1f2937",
                  background: "#020617",
                }}
              >
                <div>
                  {selectedAsset.imageUrl ? (
                    <img
                      src={selectedAsset.imageUrl}
                      alt={selectedAsset.title}
                      style={{
                        width: 48,
                        height: 48,
                        objectFit: "cover",
                        borderRadius: 6,
                        border: "1px solid #374151",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 6,
                        border: "1px dashed #374151",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.7rem",
                        color: "#6b7280",
                      }}
                    >
                      No image
                    </div>
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      marginBottom: 2,
                    }}
                  >
                    {selectedAsset.title}
                  </div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "#6b7280",
                      wordBreak: "break-all",
                    }}
                  >
                    {selectedAsset.id}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Active toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              id="active"
              type="checkbox"
              checked={product.active}
              onChange={(e) =>
                handleFieldChange("active", e.target.checked)
              }
            />
            <label htmlFor="active" style={{ fontSize: "0.9rem" }}>
              Active (show in shop)
            </label>
          </div>

          {/* Error + save */}
          {error && (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: "#fca5a5",
              }}
            >
              {error}
            </p>
          )}

          <div
            style={{
              marginTop: 8,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => router.push("/admin/products")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #4b5563",
                background: "#111827",
                color: "#e5e7eb",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #10b981",
                background: saving ? "#064e3b" : "#022c22",
                color: "#a7f3d0",
                cursor: saving ? "default" : "pointer",
                fontSize: "0.9rem",
                opacity: saving ? 0.8 : 1,
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>

      {assetPickerOpen && (
        <AssetPicker
          onSelect={handleAssetSelected}
          onClose={() => setAssetPickerOpen(false)}
        />
      )}
    </main>
  );
}
