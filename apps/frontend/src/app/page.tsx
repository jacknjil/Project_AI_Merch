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

      {/* ── 2. FEATURED PRODUCTS ─────────────────────────────── */}
      <section className="border-t border-white/5 bg-secondary px-6 py-14">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-baseline justify-between">
            <div>
              <p className="mb-1 text-xs tracking-[0.3em] text-accent uppercase">Shop</p>
              <h2 className="text-2xl font-bold text-primary">Featured Products</h2>
            </div>
            <Link
              href="/products"
              className="border-b border-muted/40 pb-0.5 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
            >
              View All →
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[
              { label: 'Tee — S/M/L/XL', price: '$34.99' },
              { label: 'Hoodie — S/M/L', price: '$59.99' },
              { label: 'Mug — 11oz', price: '$24.99' },
              { label: 'Cap — One Size', price: '$29.99' },
            ].map((item) => (
              <div
                key={item.label}
                className="min-w-[160px] flex-shrink-0 overflow-hidden rounded-lg border border-white/8 bg-background"
              >
                <div className="flex h-[120px] items-center justify-center bg-white/5">
                  <div className="h-12 w-12 rounded bg-white/10" />
                </div>
                <div className="p-3">
                  <p className="mb-1 text-xs text-muted">{item.label}</p>
                  <p className="text-sm font-semibold text-primary">{item.price}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS ──────────────────────────────────── */}
      <section className="border-t border-white/5 px-6 py-16 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="mb-2 text-xs tracking-[0.3em] text-muted uppercase">Process</p>
          <h2 className="mb-10 text-2xl font-bold text-primary">How It Works</h2>
          <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {[
              {
                step: '1',
                title: 'Generate',
                desc: 'Type a prompt. DALL-E creates your artwork in seconds.',
              },
              { isArrow: true, id: 'arrow-1' },
              {
                step: '2',
                title: 'Apply',
                desc: 'Place your art on a tee, hoodie, mug, or more.',
              },
              { isArrow: true, id: 'arrow-2' },
              {
                step: '3',
                title: 'Buy',
                desc: 'Checkout and get it delivered. Yours alone.',
              },
            ].map((item) => {
              if (item.isArrow) {
                return (
                  <div key={item.id} className="hidden text-2xl text-white/20 md:block">
                    →
                  </div>
                );
              }
              return (
                <div key={item.step} className="rounded-xl border border-white/8 bg-secondary p-6">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-accent text-sm font-bold text-accent">
                    {item.step}
                  </div>
                  <h3 className="mb-2 font-semibold text-primary">{item.title}</h3>
                  <p className="text-xs leading-relaxed text-muted">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 4. AI STUDIO TEASER ──────────────────────────────── */}
      <section className="relative overflow-hidden border-y border-accent px-6 py-14">
        <div className="absolute inset-0 bg-accent/3" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs tracking-[0.3em] text-accent uppercase">Create</p>
            <h2 className="mb-4 text-2xl font-bold text-primary">AI Studio</h2>
            <p className="mb-6 text-sm leading-relaxed text-muted">
              Describe anything — a cyberpunk city at dusk, a wolf in neon rain,
              an abstract glitch. Watch it appear in seconds, then put it on merch.
            </p>
            <Link
              href="/studio/generate"
              className="inline-block rounded bg-accent px-6 py-2.5 text-sm font-bold text-black transition-colors hover:opacity-90"
            >
              Open Studio →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-secondary">
            <div className="border-b border-white/8 px-4 py-3">
              <p className="text-xs italic text-muted">&ldquo;a neon wolf in cyberpunk rain&rdquo;</p>
            </div>
            <div className="flex h-40 items-center justify-center bg-background">
              <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-3xl text-white/20">
                ◈
              </div>
            </div>
            <div className="flex justify-end border-t border-white/8 px-4 py-3">
              <span className="rounded border border-accent px-3 py-1 text-xs text-accent">
                Apply to Merch →
              </span>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
