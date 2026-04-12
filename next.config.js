/** @type {import('next').NextConfig} */
const nextConfig = {
  // ioredis uses native Node.js modules — must stay server-side only
  serverExternalPackages: ['ioredis'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
