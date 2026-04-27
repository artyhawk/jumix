import { termsMetadata } from '@/lib/marketing-metadata'
import type { Metadata } from 'next'
import { TermsContent } from './content'

export const metadata: Metadata = termsMetadata()

export default function TermsPage() {
  return <TermsContent />
}
