import type { MetadataRoute } from 'next'

const BASE = 'https://jumix.kz'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/terms'],
        disallow: [
          '/login',
          '/dashboard',
          '/approvals',
          '/organizations',
          '/cranes',
          '/sites',
          '/me',
          '/license',
          '/memberships',
          '/incidents',
          '/crane-profiles',
          '/organization-operators',
          '/hire-requests',
          '/my-cranes',
          '/my-operators',
          '/api/',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  }
}
