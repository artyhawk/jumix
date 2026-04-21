import { sql } from 'drizzle-orm'
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { siteStatusEnum } from './enums'
import { organizations } from './organizations'

/**
 * PostGIS GEOGRAPHY(Point, 4326). Drizzle не умеет нативно работать со
 * spatial-колонками: все коорд. операции идут через raw SQL (ST_MakePoint при
 * insert, ST_X/ST_Y при select — см. SiteRepository). customType здесь нужен
 * чтобы drizzle-kit знал о существовании колонки и не пытался генерировать
 * diff-миграцию при `db:generate`.
 */
const geography = customType<{ data: unknown; driverData: unknown }>({
  dataType: () => 'geography(Point, 4326)',
})

export const sites = pgTable(
  'sites',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    address: text(),
    geofenceCenter: geography('geofence_center').notNull(),
    geofenceRadiusM: integer().notNull().default(150),
    status: siteStatusEnum().notNull().default('active'),
    notes: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // Частый list-запрос «объекты организации без архивных»
    index('sites_organization_active_idx')
      .on(t.organizationId)
      .where(sql`status <> 'archived'`),
    // GIST для будущих spatial-запросов (shift-модуль, поиск объекта по точке)
    index('sites_geofence_gist_idx').using('gist', t.geofenceCenter),
    check(
      'sites_geofence_radius_chk',
      sql`${t.geofenceRadiusM} > 0 AND ${t.geofenceRadiusM} <= 10000`,
    ),
  ],
)

export const SITE_STATUSES = ['active', 'completed', 'archived'] as const
export type SiteStatus = (typeof SITE_STATUSES)[number]

/**
 * Hydrated row-тип: то, что репозиторий возвращает наверх — с latitude/
 * longitude как отдельные double-поля, извлечёнными из geofence_center через
 * ST_X/ST_Y. Drizzle `$inferSelect` не подходит (вернул бы geofence_center как
 * unknown); Site — source of truth для service + handler + DTO.
 */
export type Site = {
  id: string
  organizationId: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  geofenceRadiusM: number
  status: SiteStatus
  notes: string | null
  createdAt: Date
  updatedAt: Date
}
