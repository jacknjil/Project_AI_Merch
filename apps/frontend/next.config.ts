/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/v0/b/**',
      },
      // If you ever store urls like https://storage.googleapis.com/...
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/**',
      },
      // Your own domain (mock.png / any hosted images)
      {
        protocol: 'https',
        hostname: 'ai-merch.jjrsguide.com',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
