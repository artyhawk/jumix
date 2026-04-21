import type { DatabaseClient, NewAuthEvent } from '@jumix/db'
import { authEvents } from '@jumix/db'
import { and, eq, gt, sql } from 'drizzle-orm'

export type LogAuthEventInput = Omit<NewAuthEvent, 'id' | 'createdAt'>

/**
 * AuthEventRepository — пишет audit-события в `auth_events` (§5.4) и
 * отдаёт агрегаты для rate-limit / backoff логики password-flow (§5.3).
 *
 * Не фильтрует по tenant: auth-события — глобальный журнал, скоп вводится
 * на уровне вызывающего handler'а через userId/phone/ip.
 */
export class AuthEventRepository {
  constructor(private readonly database: DatabaseClient) {}

  async log(input: LogAuthEventInput): Promise<void> {
    await this.database.db.insert(authEvents).values(input)
  }

  /**
   * Считает события определённого типа по phone за окно `since` назад.
   * Используется для:
   *  - password-backoff (count of 'login_failure' per phone)
   *  - SMS-per-phone rate limit (count of 'sms_requested' per phone)
   */
  async countByPhoneSince(
    phone: string,
    eventType: NewAuthEvent['eventType'],
    since: Date,
  ): Promise<number> {
    const rows = await this.database.db
      .select({ count: sql<number>`count(*)::int` })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.phone, phone),
          eq(authEvents.eventType, eventType),
          gt(authEvents.createdAt, since),
        ),
      )
    return rows[0]?.count ?? 0
  }

  /**
   * Счётчик по IP за окно. Для SMS-per-IP и грубых login-flood'ов.
   */
  async countByIpSince(
    ipAddress: string,
    eventType: NewAuthEvent['eventType'],
    since: Date,
  ): Promise<number> {
    const rows = await this.database.db
      .select({ count: sql<number>`count(*)::int` })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.ipAddress, ipAddress),
          eq(authEvents.eventType, eventType),
          gt(authEvents.createdAt, since),
        ),
      )
    return rows[0]?.count ?? 0
  }
}
