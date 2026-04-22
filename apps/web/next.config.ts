import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '*.jumix.kz' },
      { protocol: 'https', hostname: '*.amazonaws.com' },
    ],
  },
  typedRoutes: true,
  transpilePackages: ['@jumix/shared'],
}

export default nextConfig
