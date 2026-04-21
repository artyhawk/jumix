import { z } from 'zod'

/**
 * Серверная env-схема. Валидируется при старте и тестах.
 *
 * Принцип: fail-fast. Лучше упасть при boot, чем через 20 минут
 * в проде на первом запросе обнаружить что REDIS_URL не задан.
 *
 * Добавляем ключи по мере подключения модулей (auth, s3, mobizon, …).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Postgres connection string. Требуется в runtime для readiness-проб и repositories. */
  DATABASE_URL: z.string().url(),

  /**
   * CORS origins. В dev разрешаем localhost, в prod — явные origin'ы веба/мобилки.
   * Формат: через запятую. Пустая строка → запретить cross-origin.
   */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001')
    .transform((raw) =>
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
})

export type Env = z.infer<typeof envSchema>

/**
 * Валидирует process.env и возвращает типизированный Env.
 * Бросает ZodError c подробностями — обработать на стороне caller (server.ts).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source)
}
