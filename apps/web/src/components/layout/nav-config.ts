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
 * Nav items по ролям. Superadmin кабинет реализован в B3-UI-2;
 * owner / operator — placeholder на "/" (B3-UI-3/4).
 */
export const navItemsByRole: Record<UserRole, NavItem[]> = {
  superadmin: [
    { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard, section: 'operations' },
    { labelKey: 'nav.approvals', href: '/approvals', icon: ShieldCheck, section: 'operations' },
    {
      labelKey: 'nav.organizations',
      href: '/organizations',
      icon: Building2,
      section: 'management',
    },
    {
      labelKey: 'nav.cranes',
      href: '/cranes',
      icon: IconCrane as LucideIcon,
      section: 'operations',
    },
    { labelKey: 'nav.craneProfiles', href: '/crane-profiles', icon: HardHat, section: 'people' },
    { labelKey: 'nav.operators', href: '/organization-operators', icon: Users, section: 'people' },
  ],
  owner: [
    { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard, section: 'operations' },
    { labelKey: 'nav.sites', href: '/sites', icon: MapPin, section: 'operations' },
    { labelKey: 'nav.myCranes', href: '/', icon: IconCrane as LucideIcon, section: 'operations' },
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
