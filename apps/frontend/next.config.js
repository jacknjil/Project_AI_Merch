/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'oaidalleapiprodscus.blob.core.windows.net',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google Auth profiles
      },
      {
        protocol: 'https',
        hostname: 'placehold.co', // Google Auth profiles
      },
      { protocol: 'https', hostname: 'images-api.printify.com' },
      { protocol: 'https', hostname: 'cdn.printify.com' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Ensures the bundled text-overlay font survives standalone-build file
  // tracing for the route that reads it at runtime. Key must be the route
  // path with no /route suffix (verified against a real Next 16.1.6 build —
  // the /route-suffixed form silently drops the file).
  outputFileTracingIncludes: {
    '/api/n8n/create-asset': ['./src/lib/fonts/**'],
  },
  // opentype.js ships an ESM build (package.json "module") with no default
  // export, alongside a CJS build (package.json "main") that synthesizes one.
  // Webpack's bundler prefers "module", so `import opentype from 'opentype.js'`
  // silently resolves to undefined in the bundled server output (throws
  // "Cannot read properties of undefined (reading 'parse')" at runtime) even
  // though it works fine under ts-node/tsx, which resolves "main" instead.
  // Marking it external forces a native require() of the CJS build at runtime.
  serverExternalPackages: ['opentype.js'],
};

module.exports = nextConfig;
