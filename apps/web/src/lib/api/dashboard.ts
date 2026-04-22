import { apiFetch } from './client'
import type { DashboardStats } from './types'

export function getDashboardStats() {
  return apiFetch<DashboardStats>('/api/v1/dashboard/stats', { method: 'GET' })
}
