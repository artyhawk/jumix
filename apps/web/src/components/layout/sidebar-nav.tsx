'use client'

import type { UserRole } from '@/lib/api/types'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type NavItem, navItemsByRole, sectionOrder } from './nav-config'

/**
 * Общая логика nav — разделение на секции + рендер items. Используется
 * и в desktop-sidebar, и в mobile-drawer, только со своими стилями.
 */
export function SidebarNav({
  role,
  collapsed = false,
  onNavigate,
}: {
  role: UserRole
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const items = navItemsByRole[role]
  const bySection = new Map<NavItem['section'], NavItem[]>()
  for (const item of items) {
    const list = bySection.get(item.section) ?? []
    list.push(item)
    bySection.set(item.section, list)
  }

  return (
    <nav className="flex flex-col gap-4 py-3" aria-label="Основная навигация">
      {sectionOrder.map((section) => {
        const list = bySection.get(section)
        if (!list || list.length === 0) return null
        return (
          <div key={section} className="flex flex-col gap-0.5">
            {!collapsed ? (
              <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.08em] font-semibold text-text-tertiary">
                {t(`nav.sections.${section}`)}
              </div>
            ) : null}
            {list.map((item) => (
              <NavLink
                key={`${item.labelKey}-${item.section}`}
                item={item}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )
      })}
    </nav>
  )
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  // В B3-UI-1 все href=/ — активный всегда welcome. Когда добавятся реальные
  // роуты, заменим на startsWith(item.href).
  const isActive = pathname === item.href && item.labelKey === 'nav.dashboard'
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-3 mx-2 rounded-md px-2 py-2',
        'text-sm font-medium transition-colors duration-150',
        'min-h-[40px] md:min-h-0 md:h-9',
        isActive
          ? 'bg-layer-2 text-text-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-layer-2/60',
        collapsed && 'justify-center px-0',
      )}
    >
      {isActive ? (
        <motion.span
          layoutId="sidebar-active-dot"
          aria-hidden
          className="absolute left-[-8px] top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-brand-500"
        />
      ) : null}
      <Icon
        aria-hidden
        className={cn(
          'size-[18px] shrink-0 transition-opacity',
          isActive ? 'opacity-100 text-brand-500' : 'opacity-75 group-hover:opacity-100',
        )}
        strokeWidth={1.5}
      />
      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
    </Link>
  )
}
