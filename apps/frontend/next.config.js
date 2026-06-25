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
};

module.exports = nextConfig;
