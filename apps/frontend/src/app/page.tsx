import Link from 'next/link';

export default function Home() {
  return (
    <div className="w-full">

      {/* ── 1. HERO ─────────────────────────────────────────── */}
      <section className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,rgba(0,255,65,0.06),transparent_70%)]" />
        <div className="relative">
          <p className="mb-4 text-xs tracking-[0.4em] text-accent uppercase">
            AI-Powered Merch Studio
          </p>
          <h1 className="mb-4 text-5xl font-black leading-tight text-primary">
            Your Art.<br />Your Merch.
          </h1>
          <p className="mx-auto mb-8 max-w-md text-sm text-muted">
            Generate custom AI artwork and wear it. Every piece is one of a kind.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/products"
              className="rounded border border-white/20 px-6 py-2.5 text-sm text-muted transition-colors hover:border-white/40 hover:text-primary"
            >
              Browse Shop
            </Link>
            <Link
              href="/studio/generate"
              className="rounded bg-accent px-6 py-2.5 text-sm font-bold text-black transition-colors hover:opacity-90"
            >
              Start Creating →
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
