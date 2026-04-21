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

  /**
   * Redis для rate-limit, SMS-cooldown и BullMQ backend. Опционален:
   *  - в dev/test без Redis использует MemoryRateLimiter;
   *  - в prod — ОБЯЗАТЕЛЕН, иначе лимиты не переживают рестарт.
   * Проверку на обязательность делаем в server.ts через refine по NODE_ENV.
   */
  REDIS_URL: z.string().url().optional(),

  /**
   * Пути к RSA-ключам для подписи/верификации access-токенов (RS256, §5.1).
   *
   * Prod: оба пути обязательны, ключи лежат на сервере, права 600.
   * Dev/test: если пути не заданы, plugins/jwt.ts генерирует ephemeral keypair
   * при старте (с WARN-логом). Генерация in-memory означает что после рестарта
   * все ранее выданные токены недействительны — для локальной разработки OK.
   */
  JWT_PRIVATE_KEY_PATH: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),

  /** JWT iss/aud claims. Клиенты проверяют эти поля при decode. */
  JWT_ISSUER: z.string().min(1).default('jumix-api'),
  JWT_AUDIENCE: z.string().min(1).default('jumix-clients'),

  /** TTL access-токена (§5.1: 15 минут). */
  JWT_ACCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),

  /**
   * Object storage (MinIO в dev/prod, AWS/Hetzner/Cloud.kz S3 если переедем).
   *
   * Drайвер выбирается плагином (apps/api/src/plugins/storage.ts):
   *  - STORAGE_ENDPOINT задан → MinioStorageClient через minio npm-пакет
   *  - не задан → InMemoryStorageClient (dev без compose / test без Testcontainers)
   *
   * В prod оба STORAGE_ENDPOINT + creds обязательны — проверяется в
   * server.ts (refine по NODE_ENV), как с REDIS_URL.
   *
   * Конвенция ключей и TTL — docs/architecture/storage.md.
   */
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().min(1).default('us-east-1'),
  STORAGE_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_SECRET_KEY: z.string().min(1).optional(),
  STORAGE_BUCKET: z.string().min(1).default('jumix-documents'),
  /** MinIO не поддерживает vhost-style. Для AWS S3 можно оставить true. */
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((raw) => raw === 'true'),
  /** TTL presigned GET (просмотр в UI). */
  STORAGE_PRESIGN_GET_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  /** TTL presigned PUT (простой upload, короткая сессия). */
  STORAGE_PRESIGN_PUT_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60),
  /** TTL presigned part-URL (multipart части, длинные mobile-аплоады). */
  STORAGE_PRESIGN_PART_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  /**
   * Автосоздание бакета плагином при старте.
   *  - dev/test: по умолчанию true (MinIO контейнер пустой)
   *  - prod: false (bucket провижинится инфрой/террформом)
   * Читается плагином как string-boolean.
   */
  STORAGE_ENSURE_BUCKET: z
    .string()
    .optional()
    .transform((raw) => (raw === undefined ? undefined : raw === 'true')),
})

export type Env = z.infer<typeof envSchema>

/**
 * Валидирует process.env и возвращает типизированный Env.
 * Бросает ZodError c подробностями — обработать на стороне caller (server.ts).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source)
}
