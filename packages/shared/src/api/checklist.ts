/**
 * Pre-shift checklist (M6, ADR 0008) — обязательная проверка СИЗ перед
 * каждой сменой. Items predefined enum, conditional по crane.type.
 *
 * Surface'ится в трёх местах:
 *   - apps/api: validates incoming payload в shift.service.start
 *   - apps/web: read-only display в IncidentDrawer (ссылка из shift'а в
 *     backlog) — пока через DTO в shift detail
 *   - apps/mobile: render checklist screen перед start, submit embedded
 */

import type { CraneType } from './shift'

// CraneType re-exported чтобы web/mobile могли import чистый shared
// контракт без cross-file lookup.
export type { CraneType } from './shift'

export const CHECKLIST_ITEMS = [
  'helmet',
  'vest',
  'boots',
  'gloves',
  'harness',
  'first_aid_kit',
  'crane_integrity',
] as const

export type ChecklistItemKey = (typeof CHECKLIST_ITEMS)[number]

/**
 * Required items by crane type. Tower crane operators работают на высоте
 * → harness обязателен. Mobile/crawler/overhead — наземные/в кабине,
 * harness не требуется (но operator может submit it всё равно — backend
 * принимает, валидирует только что required все checked).
 */
export const REQUIRED_ITEMS_BY_CRANE_TYPE: Record<CraneType, readonly ChecklistItemKey[]> = {
  tower: ['helmet', 'vest', 'boots', 'gloves', 'harness', 'first_aid_kit', 'crane_integrity'],
  mobile: ['helmet', 'vest', 'boots', 'gloves', 'first_aid_kit', 'crane_integrity'],
  crawler: ['helmet', 'vest', 'boots', 'gloves', 'first_aid_kit', 'crane_integrity'],
  overhead: ['helmet', 'vest', 'boots', 'gloves', 'first_aid_kit', 'crane_integrity'],
}

export const CHECKLIST_ITEM_LABELS: Record<ChecklistItemKey, string> = {
  helmet: 'Каска',
  vest: 'Сигнальный жилет',
  boots: 'Защитная обувь',
  gloves: 'Перчатки',
  harness: 'Страховочный пояс',
  first_aid_kit: 'Аптечка',
  crane_integrity: 'Кран в исправном состоянии',
}

export interface ChecklistItem {
  checked: boolean
  photoKey: string | null
  notes: string | null
}

export interface ChecklistSubmission {
  items: Record<ChecklistItemKey, ChecklistItem>
  generalNotes?: string | null
}

/**
 * Утилита: возвращает список items, которые обязательны для данного типа
 * крана но в submission либо отсутствуют, либо checked=false. Используется
 * на backend для валидации (422 если non-empty), на mobile для disable
 * "Начать смену" кнопки.
 */
export function findUncheckedRequiredItems(
  craneType: CraneType,
  submission: ChecklistSubmission,
): ChecklistItemKey[] {
  const required = REQUIRED_ITEMS_BY_CRANE_TYPE[craneType]
  const missing: ChecklistItemKey[] = []
  for (const key of required) {
    const item = submission.items[key]
    if (!item || !item.checked) missing.push(key)
  }
  return missing
}
