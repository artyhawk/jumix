import type { MeStatusResponse } from '@jumix/shared'
import { apiFetch } from './client'

/**
 * GET /api/v1/crane-profiles/me/status — operator landing data.
 * Single source-of-truth для /me + /license + /memberships screens.
 */
export async function getMeStatus(): Promise<MeStatusResponse> {
  return apiFetch<MeStatusResponse>('/api/v1/crane-profiles/me/status')
}
