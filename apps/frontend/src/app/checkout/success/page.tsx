// src/app/checkout/success/page.tsx
import Link from 'next/link';

type Props = {
  searchParams?: { session_id?: string };
};

export default function CheckoutSuccessPage({ searchParams }: Props) {
  const sessionId = searchParams?.session_id;

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
      <h1 style={{ fontSize: '2rem', marginBottom: 8 }}>Thank you!</h1>
      <p style={{ marginBottom: 16 }}>
        Your order has been received and is being processed.
      </p>

      {sessionId && (
        <p
          style={{
            marginBottom: 16,
            fontSize: '0.85rem',
            color: '#9ca3af',
          }}
        >
          Stripe session id: <code>{sessionId}</code>
        </p>
      )}

      <Link
        href="/"
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid #10b981',
          background: '#022c22',
          color: '#a7f3d0',
          textDecoration: 'none',
          fontSize: '0.9rem',
        }}
      >
        Back to home
      </Link>
    </main>
  );
}
