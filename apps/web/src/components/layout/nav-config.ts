import type { UserRole } from '@/lib/api/types'
import { IconCrane } from '@tabler/icons-react'
import {
  Building2,
  HardHat,
  IdCard,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  ShieldCheck,
  UserCircle,
  Users,
  UsersRound,
} from 'lucide-react'

export interface NavItem {
  labelKey: string
  href: string
  icon: LucideIcon | typeof IconCrane
  section: 'operations' | 'people' | 'finance' | 'management'
}

/**
 * Nav items по ролям. В B3-UI-1 все указывают на "/" (welcome placeholder);
 * реальные routes добавляются в B3-UI-2/3/4 по мере реализации кабинетов.
 */
export const navItemsByRole: Record<UserRole, NavItem[]> = {
  superadmin: [
    { labelKey: 'nav.dashboard', href: '/', icon: LayoutDashboard, section: 'operations' },
    { labelKey: 'nav.approvals', href: '/', icon: ShieldCheck, section: 'operations' },
    { labelKey: 'nav.organizations', href: '/', icon: Building2, section: 'management' },
    { labelKey: 'nav.cranes', href: '/', icon: IconCrane as LucideIcon, section: 'operations' },
    { labelKey: 'nav.craneProfiles', href: '/', icon: HardHat, section: 'people' },
    { labelKey: 'nav.operators', href: '/', icon: Users, section: 'people' },
  ],
  owner: [
    { labelKey: 'nav.dashboard', href: '/', icon: LayoutDashboard, section: 'operations' },
    { labelKey: 'nav.myCranes', href: '/', icon: IconCrane as LucideIcon, section: 'operations' },
    { labelKey: 'nav.sites', href: '/', icon: MapPin, section: 'operations' },
    { labelKey: 'nav.myOperators', href: '/', icon: UsersRound, section: 'people' },
    { labelKey: 'nav.hireRequests', href: '/', icon: ShieldCheck, section: 'people' },
  ],
  operator: [
    { labelKey: 'nav.myProfile', href: '/', icon: UserCircle, section: 'people' },
    { labelKey: 'nav.license', href: '/', icon: IdCard, section: 'people' },
    { labelKey: 'nav.memberships', href: '/', icon: Building2, section: 'people' },
  ],
}

export const sectionOrder: Array<NavItem['section']> = [
  'operations',
  'people',
  'finance',
  'management',
]
