import Image from 'next/image';

export default function HomePage() {
  return (
    // THE GRID CONTAINER: 1 column on mobile, 3 on desktop
    <main className="min-h-screen bg-black p-8 grid grid-cols-1 md:grid-cols-3 gap-6 font-sans text-white">
      {/* BOX 1: Hero Header (Spans 2 columns on desktop) */}
      <section className="md:col-span-2 rounded-4xl border border-white/10 bg-linear-to-br from-cyan-500/20 to-purple-600/20 p-10 backdrop-blur-xl">
        <h1 className="text-5xl font-light tracking-tight">
          AI Merch <span className="font-bold text-cyan-400">Engine</span>
        </h1>
        <p className="mt-4 text-xl text-white/60">
          Welcome to your dev storefront.
        </p>
      </section>

      {/* BOX 2: Status/System Tile */}
      <section className="rounded-4xl border border-white/10 bg-white/5 p-8 flex flex-col justify-center items-center text-center">
        <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse mb-4" />
        <h2 className="text-sm font-mono uppercase tracking-widest text-white/40">
          System Status
        </h2>
        <p className="text-lg font-medium">Ready for Deployment</p>
      </section>

      {/* BOX 3: Navigation/Test Tile */}
      <section className="rounded-4xl border border-white/10 bg-white/5 p-8 hover:bg-white/10 transition-colors">
        <h3 className="text-lg font-semibold mb-2">Debug Console</h3>
        <p className="text-white/60 mb-6">
          Verify your real-time Firestore synchronization.
        </p>
        <a
          href="/test"
          className="inline-block px-6 py-3 rounded-full bg-cyan-500 text-black font-bold text-sm"
        >
          Run /test Diagnostic
        </a>
      </section>

      {/* BOX 4: Compact Product Tile */}
      <section className="rounded-4xl border border-white/10 bg-white/5 overflow-hidden flex flex-col group p-2">
        {/* Visual Stimuli: The Image */}
        <div className="aspect-square relative overflow-hidden rounded-3xl bg-white/5">
          <Image
            src="https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=1000&auto=format&fit=crop"
            alt="AI Hoodie"
            fill // This tells Next.js to fill the container instead of needing a set width/height
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        </div>

        {/* Purpose: The Details */}
        <div className="p-4">
          <h3 className="text-lg font-bold text-white truncate">
            Cyber Hoodie
          </h3>
          <div className="flex items-center justify-between mt-2">
            <span className="text-cyan-400 font-mono text-sm">$65.00</span>
            <button className="h-8 w-8 rounded-full bg-white text-black flex items-center justify-center hover:bg-cyan-400 transition-colors">
              <span className="text-xl leading-none">+</span>
            </button>
          </div>
        </div>
      </section>

      {/* NEW BOX 5: The Actual n8n Payload / Logs */}
      <section className="rounded-4xl border border-dashed border-white/10 bg-white/2 p-6 flex flex-col">
        <h3 className="text-xs font-mono text-white/30 uppercase mb-4">
          Live Activity
        </h3>
        <div className="flex-1 font-mono text-[10px] text-cyan-400/60 overflow-hidden">
          <p className="">{'>'} Listening for webhook...</p>
          <p className="mt-1">{'>'} Connection: STABLE</p>
        </div>
      </section>
    </main>
  );
}
