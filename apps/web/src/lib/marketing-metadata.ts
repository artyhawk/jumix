import { t } from '@/lib/i18n'
import type { Metadata } from 'next'

const SITE_URL = 'https://jumix.kz'

export function landingMetadata(): Metadata {
  const title = t('marketing.metadata.title')
  const description = t('marketing.metadata.description')
  return {
    title: { absolute: title },
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: '/' },
    openGraph: {
      title,
      description,
      url: SITE_URL,
      siteName: 'Jumix',
      locale: 'ru_KZ',
      type: 'website',
      images: [
        {
          url: '/brand/logo-full.png',
          width: 1200,
          height: 630,
          alt: t('marketing.metadata.ogImageAlt'),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/brand/logo-full.png'],
    },
  }
}

export function privacyMetadata(): Metadata {
  return {
    title: { absolute: t('marketing.metadata.privacyTitle') },
    description: t('marketing.metadata.privacyDescription'),
    alternates: { canonical: '/privacy' },
    openGraph: {
      title: t('marketing.metadata.privacyTitle'),
      description: t('marketing.metadata.privacyDescription'),
      url: `${SITE_URL}/privacy`,
      siteName: 'Jumix',
      locale: 'ru_KZ',
      type: 'article',
    },
  }
}

export function termsMetadata(): Metadata {
  return {
    title: { absolute: t('marketing.metadata.termsTitle') },
    description: t('marketing.metadata.termsDescription'),
    alternates: { canonical: '/terms' },
    openGraph: {
      title: t('marketing.metadata.termsTitle'),
      description: t('marketing.metadata.termsDescription'),
      url: `${SITE_URL}/terms`,
      siteName: 'Jumix',
      locale: 'ru_KZ',
      type: 'article',
    },
  }
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Jumix',
    url: SITE_URL,
    logo: `${SITE_URL}/brand/logo-mark.png`,
    description: t('marketing.metadata.description'),
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'KZ',
      addressLocality: 'Шымкент',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+7-702-224-44-28',
      contactType: 'customer support',
      availableLanguage: ['Russian', 'Kazakh'],
    },
  }
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Jumix',
    url: SITE_URL,
    inLanguage: 'ru-KZ',
  }
}
