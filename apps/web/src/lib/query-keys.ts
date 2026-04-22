import type { ListCraneProfilesQuery } from './api/crane-profiles'
import type { ListCranesQuery } from './api/cranes'
import type { ListOrganizationOperatorsQuery } from './api/organization-operators'
import type { ListOrganizationsQuery } from './api/organizations'
import type { ListSitesQuery } from './api/sites'

/**
 * Query keys — namespaced tuples. Используем массивы-префиксы чтобы
 * invalidate'ить группы (например, все списки crane-profiles независимо
 * от фильтров).
 */
export const qk = {
  dashboard: ['dashboard'] as const,
  dashboardStats: ['dashboard', 'stats'] as const,
  dashboardOwnerStats: ['dashboard', 'owner-stats'] as const,

  audit: ['audit'] as const,
  auditRecent: (limit: number) => ['audit', 'recent', limit] as const,

  organizations: ['organizations'] as const,
  organizationsList: (query: ListOrganizationsQuery) => ['organizations', 'list', query] as const,
  organizationsInfinite: (query: Omit<ListOrganizationsQuery, 'cursor'>) =>
    ['organizations', 'infinite', query] as const,
  organizationDetail: (id: string) => ['organizations', 'detail', id] as const,

  craneProfiles: ['crane-profiles'] as const,
  craneProfilesList: (query: ListCraneProfilesQuery) => ['crane-profiles', 'list', query] as const,
  craneProfilesInfinite: (query: Omit<ListCraneProfilesQuery, 'cursor'>) =>
    ['crane-profiles', 'infinite', query] as const,
  craneProfileDetail: (id: string) => ['crane-profiles', 'detail', id] as const,

  cranes: ['cranes'] as const,
  cranesList: (query: ListCranesQuery) => ['cranes', 'list', query] as const,
  cranesInfinite: (query: Omit<ListCranesQuery, 'cursor'>) =>
    ['cranes', 'infinite', query] as const,
  craneDetail: (id: string) => ['cranes', 'detail', id] as const,

  organizationOperators: ['organization-operators'] as const,
  organizationOperatorsList: (query: ListOrganizationOperatorsQuery) =>
    ['organization-operators', 'list', query] as const,
  organizationOperatorsInfinite: (query: Omit<ListOrganizationOperatorsQuery, 'cursor'>) =>
    ['organization-operators', 'infinite', query] as const,
  organizationOperatorDetail: (id: string) => ['organization-operators', 'detail', id] as const,

  sites: ['sites'] as const,
  sitesList: (query: ListSitesQuery) => ['sites', 'list', query] as const,
  sitesInfinite: (query: Omit<ListSitesQuery, 'cursor'>) => ['sites', 'infinite', query] as const,
  siteDetail: (id: string) => ['sites', 'detail', id] as const,
}
