"use client";

import React, { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AssetPicker, {
  AssetDoc,
} from "@/components/admin/AssetPicker";

export default function NewProductPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceInput, setPriceInput] = useState("19.99");
  const [mockupImageUrl, setMockupImageUrl] = useState("");
  const [defaultAssetId, setDefaultAssetId] = useState("");
  const [active, setActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asset picker state
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetDoc | null>(
    null
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const priceNumber = parseFloat(priceInput);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      setError("Price must be a non-negative number.");
      return;
    }

    try {
      setSubmitting(true);

      const docRef = await addDoc(collection(db, "products"), {
        name: name.trim(),
        description: description.trim(),
        price: priceNumber,
        mockupImageUrl: mockupImageUrl.trim() || null,
        defaultAssetId: defaultAssetId.trim() || null,
        active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log("[ADMIN] Created product:", docRef.id);
      router.push(`/admin/products/${docRef.id}`);
    } catch (err: any) {
      console.error("[ADMIN] Error creating product:", err);
      setError(err?.message || "Failed to create product.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssetSelected = (asset: AssetDoc) => {
    setSelectedAsset(asset);
    setDefaultAssetId(asset.id);

    // If no mockup yet, use asset image as a sensible default
    if (!mockupImageUrl && asset.imageUrl) {
      setMockupImageUrl(asset.imageUrl);
    }

    setAssetPickerOpen(false);
  };

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
            <h1 style={{ margin: 0 }}>New Product</h1>
            <p
              style={{
                margin: 0,
                marginTop: 4,
                fontSize: "0.9rem",
                color: "#9ca3af",
              }}
            >
              Create a product document that Studio, Shop, and Cart can use.
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
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
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
              value={mockupImageUrl}
              onChange={(e) => setMockupImageUrl(e.target.value)}
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
              This can be a Storage URL for a product mockup. Cart/Shop can use
              it as a preview.
            </p>

            {mockupImageUrl && (
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
                  src={mockupImageUrl}
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
                value={defaultAssetId}
                onChange={(e) => setDefaultAssetId(e.target.value)}
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
              collection so Studio can use it as the default design. You can
              either paste an ID or pick from your assets.
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
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <label htmlFor="active" style={{ fontSize: "0.9rem" }}>
              Active (show in shop)
            </label>
          </div>

          {/* Error + submit */}
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
              disabled={submitting}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #10b981",
                background: submitting ? "#064e3b" : "#022c22",
                color: "#a7f3d0",
                cursor: submitting ? "default" : "pointer",
                fontSize: "0.9rem",
                opacity: submitting ? 0.8 : 1,
              }}
            >
              {submitting ? "Creating…" : "Create product"}
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
