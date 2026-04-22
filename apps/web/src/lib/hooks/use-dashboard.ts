'use client'

import { useQuery } from '@tanstack/react-query'
import { getDashboardStats } from '../api/dashboard'
import { qk } from '../query-keys'

export function useDashboardStats() {
  return useQuery({
    queryKey: qk.dashboardStats,
    queryFn: getDashboardStats,
    staleTime: 15_000,
  })
}
