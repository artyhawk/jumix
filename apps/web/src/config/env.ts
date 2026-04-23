import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  /**
   * URL к self-hosted .pmtiles файлу (B3-UI-5b). Пусто → fallback на
   * публичный demo Protomaps endpoint (dev / ручной тест). В prod —
   * `https://jumix.kz/tiles/kz.pmtiles` (nginx serves с Range support).
   */
  NEXT_PUBLIC_TILES_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

/**
 * Валидация env на старте. Падает при отсутствии/невалидном значении —
 * fail-fast перед тем как код пытается работать.
 *
 * `NEXT_PUBLIC_*` пробрасывается в клиент Next'ом — оба серверный и
 * браузерный bundle получают одинаковое значение.
 */
export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
  NEXT_PUBLIC_TILES_URL: process.env.NEXT_PUBLIC_TILES_URL,
})
