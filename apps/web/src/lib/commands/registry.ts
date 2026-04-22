import type { UserRole } from '@/lib/api/types'
import { IconCrane } from '@tabler/icons-react'
import {
  Building2,
  HardHat,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  MapPin,
  Plus,
  Shield,
  Users,
} from 'lucide-react'

/**
 * Command palette registry. Declarative — menu renders через `getCommandsForRole`.
 * Навигация → `href`, действия (logout, open-dialog, etc) → `action`.
 *
 * Keywords concatenated в search value для cmdk fuzzy matching (ищется
 * "одоб" → matches "Заявки на рассмотрение" через keyword "одобрение").
 */
export type CommandGroup = 'navigation' | 'actions' | 'system'

/** Icon может быть lucide ИЛИ tabler — оба поддерживают одинаковый контракт. */
export type CommandIconComponent = LucideIcon | typeof IconCrane

export interface CommandEntry {
  id: string
  label: string
  keywords?: string[]
  shortcut?: string[]
  icon?: CommandIconComponent
  group: CommandGroup
  roles: UserRole[]
  href?: string
  action?: CommandAction
}

export type CommandAction = 'logout' | 'create-organization' | 'create-site' | 'create-crane'

export const COMMAND_REGISTRY: CommandEntry[] = [
  // ---- Navigation — superadmin ----
  {
    id: 'nav.dashboard',
    label: 'Обзор платформы',
    keywords: ['dashboard', 'обзор', 'главная'],
    icon: LayoutDashboard,
    group: 'navigation',
    roles: ['superadmin'],
    href: '/dashboard',
  },
  {
    id: 'nav.approvals',
    label: 'Заявки на рассмотрение',
    keywords: ['approvals', 'одобрение', 'zayavki'],
    icon: Shield,
    group: 'navigation',
    roles: ['superadmin'],
    href: '/approvals',
  },
  {
    id: 'nav.organizations',
    label: 'Организации',
    keywords: ['organizations', 'orgs', 'kompanii', 'компании'],
    icon: Building2,
    group: 'navigation',
    roles: ['superadmin'],
    href: '/organizations',
  },
  {
    id: 'nav.crane-profiles',
    label: 'Крановщики',
    keywords: ['crane profiles', 'kranovschiki', 'operators'],
    icon: HardHat,
    group: 'navigation',
    roles: ['superadmin'],
    href: '/crane-profiles',
  },
  {
    id: 'nav.cranes',
    label: 'Краны',
    keywords: ['cranes', 'kran', 'краны'],
    icon: IconCrane,
    group: 'navigation',
    roles: ['superadmin'],
    href: '/cranes',
  },
  {
    id: 'nav.organization-operators',
    label: 'Сотрудники',
    keywords: ['operators', 'hires', 'naymy', 'наймы'],
    icon: Users,
    group: 'navigation',
    roles: ['superadmin'],
    href: '/organization-operators',
  },

  // ---- Navigation — owner ----
  {
    id: 'nav.owner-dashboard',
    label: 'Обзор организации',
    keywords: ['dashboard', 'обзор', 'главная'],
    icon: LayoutDashboard,
    group: 'navigation',
    roles: ['owner'],
    href: '/dashboard',
  },
  {
    id: 'nav.sites',
    label: 'Объекты',
    keywords: ['sites', 'obyekty', 'объекты', 'стройки'],
    icon: MapPin,
    group: 'navigation',
    roles: ['owner'],
    href: '/sites',
  },
  {
    id: 'nav.my-cranes',
    label: 'Мои краны',
    keywords: ['cranes', 'kran', 'краны', 'парк', 'оборудование'],
    icon: IconCrane,
    group: 'navigation',
    roles: ['owner'],
    href: '/my-cranes',
  },

  // ---- Actions — superadmin ----
  {
    id: 'action.create-organization',
    label: 'Создать организацию',
    keywords: ['new', 'add', 'novaya', 'создать', 'добавить'],
    icon: Plus,
    group: 'actions',
    roles: ['superadmin'],
    action: 'create-organization',
  },

  // ---- Actions — owner ----
  {
    id: 'action.create-site',
    label: 'Создать объект',
    keywords: ['new', 'add', 'novyi', 'создать', 'объект', 'стройка'],
    icon: Plus,
    group: 'actions',
    roles: ['owner'],
    action: 'create-site',
  },
  {
    id: 'action.create-crane',
    label: 'Добавить кран',
    keywords: ['new', 'add', 'novyi', 'создать', 'кран', 'оборудование'],
    icon: Plus,
    group: 'actions',
    roles: ['owner'],
    action: 'create-crane',
  },

  // ---- System (all roles) ----
  {
    id: 'system.logout',
    label: 'Выйти',
    keywords: ['logout', 'signout', 'exit', 'выход'],
    icon: LogOut,
    group: 'system',
    roles: ['superadmin', 'owner', 'operator'],
    action: 'logout',
  },
]

export function getCommandsForRole(role: UserRole): CommandEntry[] {
  return COMMAND_REGISTRY.filter((cmd) => cmd.roles.includes(role))
}

export const COMMAND_GROUP_LABELS: Record<CommandGroup, string> = {
  navigation: 'Переход',
  actions: 'Действия',
  system: 'Система',
}

export const COMMAND_GROUP_ORDER: CommandGroup[] = ['navigation', 'actions', 'system']
