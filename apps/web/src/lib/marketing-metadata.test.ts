import { describe, expect, it } from 'vitest'
import {
  landingMetadata,
  organizationJsonLd,
  privacyMetadata,
  termsMetadata,
  websiteJsonLd,
} from './marketing-metadata'

describe('marketing-metadata', () => {
  it('landingMetadata has title, description, OG, Twitter card', () => {
    const m = landingMetadata()
    expect(m.title).toMatchObject({ absolute: expect.stringMatching(/jumix/i) })
    expect(typeof m.description).toBe('string')
    expect(m.openGraph?.url).toBe('https://jumix.kz')
    expect(m.openGraph?.locale).toBe('ru_KZ')
    expect(m.twitter).toMatchObject({ card: 'summary_large_image' })
  })

  it('privacy + terms metadata point to correct canonicals', () => {
    expect(privacyMetadata().alternates?.canonical).toBe('/privacy')
    expect(termsMetadata().alternates?.canonical).toBe('/terms')
  })

  it('Organization JSON-LD has @type Organization + KZ address', () => {
    const ld = organizationJsonLd()
    expect(ld['@type']).toBe('Organization')
    expect(ld.address.addressCountry).toBe('KZ')
    expect(ld.contactPoint.telephone).toContain('702-224-44-28')
  })

  it('WebSite JSON-LD with ru-KZ locale', () => {
    const ld = websiteJsonLd()
    expect(ld['@type']).toBe('WebSite')
    expect(ld.inLanguage).toBe('ru-KZ')
  })
})
