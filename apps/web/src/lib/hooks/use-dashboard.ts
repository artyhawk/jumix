'use client'

import { useQuery } from '@tanstack/react-query'
import { getDashboardStats, getOwnerDashboardStats } from '../api/dashboard'
import { qk } from '../query-keys'

export function useDashboardStats() {
  return useQuery({
    queryKey: qk.dashboardStats,
    queryFn: getDashboardStats,
    staleTime: 15_000,
  })
}

export function useOwnerDashboardStats(enabled = true) {
  return useQuery({
    queryKey: qk.dashboardOwnerStats,
    queryFn: getOwnerDashboardStats,
    staleTime: 15_000,
    enabled,
  })
}
