import { privacyMetadata } from '@/lib/marketing-metadata'
import type { Metadata } from 'next'
import { PrivacyContent } from './content'

export const metadata: Metadata = privacyMetadata()

export default function PrivacyPage() {
  return <PrivacyContent />
}
