import { apiFetch } from './client'
import type { DashboardStats, OwnerDashboardStats } from './types'

export function getDashboardStats() {
  return apiFetch<DashboardStats>('/api/v1/dashboard/stats', { method: 'GET' })
}

export function getOwnerDashboardStats() {
  return apiFetch<OwnerDashboardStats>('/api/v1/dashboard/owner-stats', { method: 'GET' })
}
