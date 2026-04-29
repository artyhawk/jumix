import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  Link2,
  Link2Off,
  Plus,
  Send,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  XCircle,
} from 'lucide-react'
import type { RecentAuditEvent } from '../api/types'

/**
 * Central registry для audit-action → label + icon + accent color.
 * Обновлять при добавлении новых auditLog.action строк в repository'ях.
 * Unknown action → neutral Clock icon + raw action-string как label.
 */
export type ActionAccent = 'success' | 'danger' | 'warning' | 'neutral'

export interface ActionIcon {
  icon: LucideIcon
  accent: ActionAccent
}

const ACTION_ICONS: Record<string, ActionIcon> = {
  // Crane profile identity pipeline
  'crane_profile.approve': { icon: CheckCircle2, accent: 'success' },
  'crane_profile.reject': { icon: XCircle, accent: 'danger' },
  'crane_profile.update': { icon: Edit, accent: 'neutral' },
  'crane_profile.self_update': { icon: Edit, accent: 'neutral' },
  'crane_profile.avatar.set': { icon: Edit, accent: 'neutral' },
  'crane_profile.avatar.clear': { icon: Edit, accent: 'neutral' },
  'crane_profile.delete': { icon: Trash2, accent: 'warning' },

  // Organization-operator hire pipeline
  'organization_operator.submit': { icon: UserPlus, accent: 'neutral' },
  'organization_operator.approve': { icon: CheckCircle2, accent: 'success' },
  'organization_operator.reject': { icon: XCircle, accent: 'danger' },
  'organization_operator.update': { icon: Edit, accent: 'neutral' },
  'organization_operator.activate': { icon: Shield, accent: 'neutral' },
  'organization_operator.block': { icon: Shield, accent: 'warning' },
  'organization_operator.terminate': { icon: UserMinus, accent: 'warning' },
  'organization_operator.delete': { icon: Trash2, accent: 'warning' },

  // Crane pipeline
  'crane.submit': { icon: Plus, accent: 'neutral' },
  'crane.approve': { icon: CheckCircle2, accent: 'success' },
  'crane.reject': { icon: XCircle, accent: 'danger' },
  'crane.update': { icon: Edit, accent: 'neutral' },
  'crane.activate': { icon: Shield, accent: 'neutral' },
  'crane.maintenance': { icon: Shield, accent: 'warning' },
  'crane.retire': { icon: Shield, accent: 'warning' },
  'crane.assign_to_site': { icon: Link2, accent: 'neutral' },
  'crane.unassign_from_site': { icon: Link2Off, accent: 'neutral' },
  'crane.resubmit': { icon: Send, accent: 'neutral' },
  'crane.delete': { icon: Trash2, accent: 'warning' },

  // Organization
  'organization.create': { icon: Plus, accent: 'neutral' },
  'organization.update': { icon: Edit, accent: 'neutral' },
  'organization.activate': { icon: Shield, accent: 'success' },
  'organization.suspend': { icon: Shield, accent: 'warning' },
  'organization.archive': { icon: Shield, accent: 'warning' },

  // Site
  'site.create': { icon: Plus, accent: 'neutral' },
  'site.update': { icon: Edit, accent: 'neutral' },
  'site.activate': { icon: Shield, accent: 'neutral' },
  'site.complete': { icon: CheckCircle2, accent: 'success' },
  'site.archive': { icon: Shield, accent: 'warning' },

  // License document
  'license.upload_self': { icon: FileText, accent: 'neutral' },
  'license.upload_admin': { icon: FileText, accent: 'neutral' },
  'license.warning_sent': { icon: AlertTriangle, accent: 'warning' },

  // Registration
  'registration.start': { icon: UserPlus, accent: 'neutral' },
  'registration.complete': { icon: UserPlus, accent: 'success' },
}

const DEFAULT_ICON: ActionIcon = { icon: Clock, accent: 'neutral' }

export function getActionIcon(action: string): ActionIcon {
  return ACTION_ICONS[action] ?? DEFAULT_ICON
}

const ACTION_LABELS: Record<string, string> = {
  'crane_profile.approve': 'Одобрил кранового',
  'crane_profile.reject': 'Отклонил кранового',
  'crane_profile.update': 'Обновил данные кранового',
  'crane_profile.self_update': 'Обновил свои данные',
  'crane_profile.avatar.set': 'Изменил аватар',
  'crane_profile.avatar.clear': 'Убрал аватар',
  'crane_profile.delete': 'Удалил кранового',

  'organization_operator.submit': 'Запросил найм',
  'organization_operator.approve': 'Одобрил найм',
  'organization_operator.reject': 'Отклонил найм',
  'organization_operator.update': 'Обновил найм',
  'organization_operator.activate': 'Активировал найм',
  'organization_operator.block': 'Заблокировал найм',
  'organization_operator.terminate': 'Уволил кранового',
  'organization_operator.delete': 'Удалил найм',

  'crane.submit': 'Добавил кран',
  'crane.approve': 'Одобрил кран',
  'crane.reject': 'Отклонил кран',
  'crane.update': 'Обновил кран',
  'crane.activate': 'Активировал кран',
  'crane.maintenance': 'Отправил кран в обслуживание',
  'crane.retire': 'Списал кран',
  'crane.assign_to_site': 'Назначил кран на объект',
  'crane.unassign_from_site': 'Снял кран с объекта',
  'crane.resubmit': 'Отправил кран на повторное одобрение',
  'crane.delete': 'Удалил кран',

  'organization.create': 'Создал организацию',
  'organization.update': 'Обновил организацию',
  'organization.activate': 'Активировал организацию',
  'organization.suspend': 'Приостановил организацию',
  'organization.archive': 'Отправил в архив',

  'site.create': 'Создал объект',
  'site.update': 'Обновил объект',
  'site.activate': 'Вернул объект в работу',
  'site.complete': 'Сдал объект',
  'site.archive': 'Архивировал объект',

  'license.upload_self': 'Загрузил удостоверение',
  'license.upload_admin': 'Загрузил удостоверение (админ)',
  'license.warning_sent': 'Напоминание об удостоверении',

  'registration.start': 'Запросил регистрацию',
  'registration.complete': 'Завершил регистрацию',
}

/**
 * Base label — без имени target-entity. Enriched rendering (с именем)
 * требует per-action metadata interpretation, это backlog.
 */
export function formatActionLabel(event: Pick<RecentAuditEvent, 'action'>): string {
  return ACTION_LABELS[event.action] ?? event.action
}
