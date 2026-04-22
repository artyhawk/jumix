/**
 * B2d-1 (ADR 0003): `operators` table dropped. Данные split'нуты на
 * `crane_profiles` (global identity) + `organization_operators` (per-org
 * membership). Миграция 0007 делает backfill 1→1.
 *
 * Этот файл остаётся как types-only compat shim для существующих consumer'ов,
 * которые импортируют hydrated `Operator` shape из `@jumix/db`. OperatorRepository
 * конструирует этот shape JOIN'ом между двумя новыми таблицами и отдаёт наверх
 * в том же формате, что был в B2b. В B2d-2 модуль разделится на
 * crane-profile + organization-operator, и этот файл уйдёт вместе с compat
 * shim'ом.
 *
 * Status/availability enums и типы теперь canonical в
 * `./organization-operators.ts`; здесь они re-export'ируются для того, чтобы
 * старые импорты `import type { OperatorStatus } from '@jumix/db'` продолжали
 * работать без изменений.
 */
export type {
  OperatorAvailability,
  OperatorStatus,
} from './organization-operators'
export { OPERATOR_AVAILABILITY, OPERATOR_STATUSES } from './organization-operators'

export type Operator = {
  id: string
  userId: string
  organizationId: string
  firstName: string
  lastName: string
  patronymic: string | null
  iin: string
  avatarKey: string | null
  hiredAt: Date | null
  terminatedAt: Date | null
  specialization: Record<string, unknown>
  status: import('./organization-operators').OperatorStatus
  availability: import('./organization-operators').OperatorAvailability | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
