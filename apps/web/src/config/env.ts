import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
})

/**
 * Валидация env на старте. Падает при отсутствии/невалидном значении —
 * fail-fast перед тем как код пытается работать.
 *
 * `NEXT_PUBLIC_API_URL` пробрасывается в клиент Next'ом — оба серверный
 * и браузерный bundle получают одинаковое значение.
 */
export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
})
