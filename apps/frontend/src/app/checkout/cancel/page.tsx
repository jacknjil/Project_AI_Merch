// src/app/checkout/cancel/page.tsx
import Link from 'next/link';

export default function CheckoutCancelPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <h1 style={{ fontSize: '2rem', marginBottom: 8 }}>Checkout cancelled</h1>
      <p style={{ marginBottom: 16 }}>
        Your payment was cancelled. You can review your cart and try again when
        you&apos;re ready.
      </p>

      <Link
        href="/cart"
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid #4b5563',
          background: '#111827',
          color: '#e5e7eb',
          textDecoration: 'none',
          fontSize: '0.9rem',
        }}
      >
        Back to cart
      </Link>
    </main>
  );
}
