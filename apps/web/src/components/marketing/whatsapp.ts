import { t } from '@/lib/i18n'

export const WHATSAPP_NUMBER = '77022244428'

/**
 * Build wa.me URL с pre-filled сообщением. wa.me on phone открывает WhatsApp app,
 * на desktop — WhatsApp Web. Сообщение URL-encoded.
 */
export function whatsappLink(message?: string): string {
  const text = encodeURIComponent(message ?? t('marketing.whatsappMessage'))
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`
}
