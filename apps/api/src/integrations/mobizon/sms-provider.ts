import type { FastifyBaseLogger } from 'fastify'

export interface SmsProvider {
  /**
   * Отправляет SMS с текстом. Бросает исключение при неудаче (5xx провайдера,
   * таймаут, невалидный номер на стороне провайдера). Caller логирует
   * в auth_events событие 'sms_requested' с success=false и reason.
   */
  send(input: { phone: string; text: string }): Promise<void>
  /** Читаемое имя для логов и health-ручек. */
  readonly name: string
}

export type MobizonConfig = {
  apiUrl: string
  apiKey: string
  from?: string
  /** Таймаут HTTP-запроса, ms. Default 8s — Mobizon медленнее банков. */
  timeoutMs?: number
}

/**
 * MobizonSmsProvider — тонкая обёртка поверх fetch, использует Mobizon Message API.
 * Документация: https://mobizon.kz/help/api-docs
 *
 * Формат ответа в норме: `{ code: 0, data: {...} }`. При code != 0 — ошибка.
 * Пока храним минимум — ID сообщения не нужен, status-callback не реализуем.
 */
export class MobizonSmsProvider implements SmsProvider {
  readonly name = 'mobizon'
  constructor(
    private readonly config: MobizonConfig,
    private readonly log: FastifyBaseLogger,
  ) {}

  async send(input: { phone: string; text: string }): Promise<void> {
    const body = new URLSearchParams({
      recipient: input.phone.replace('+', ''),
      text: input.text,
      ...(this.config.from ? { from: this.config.from } : {}),
    })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000)
    try {
      const response = await fetch(
        `${this.config.apiUrl}/service/message/sendSMSMessage?apiKey=${encodeURIComponent(
          this.config.apiKey,
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal,
        },
      )
      if (!response.ok) {
        throw new Error(`mobizon http ${response.status}`)
      }
      const json = (await response.json()) as { code: number; message?: string }
      if (json.code !== 0) {
        throw new Error(`mobizon api error code=${json.code} message=${json.message ?? ''}`)
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}

/**
 * DevStubSmsProvider — пишет в logger, не делает сетевых запросов.
 * Используется в dev/test, когда Mobizon-ключ не задан. Код SMS при этом
 * всё равно генерируется и сохраняется в store — его видно в логах, и
 * разработчик может ввести его в мобилке.
 */
export class DevStubSmsProvider implements SmsProvider {
  readonly name = 'dev-stub'
  constructor(private readonly log: FastifyBaseLogger) {}

  async send(input: { phone: string; text: string }): Promise<void> {
    this.log.warn({ phone: input.phone, text: input.text }, '[sms:dev-stub] not sending')
  }
}
