import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Standalone output (B3-UI-5b) — `next build` производит минимальный
   * `.next/standalone/` + node_modules с только нужными deps, для Docker
   * prod-образа (COPY --from=builder только standalone tree).
   */
  output: 'standalone',
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
