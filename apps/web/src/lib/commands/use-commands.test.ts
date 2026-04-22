import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandEntry } from './registry'
import { useCommands } from './use-commands'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}))

const logout = vi.fn().mockResolvedValue(undefined)
const authUser = {
  user: { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Admin' } as {
    id: string
    role: 'superadmin' | 'owner' | 'operator'
    organizationId: string | null
    name: string
  } | null,
  hydrated: true,
  isAuthenticated: true,
  logout,
}
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authUser,
}))

beforeEach(() => {
  push.mockReset()
  logout.mockReset()
  logout.mockResolvedValue(undefined)
  authUser.user = { id: 'u-1', role: 'superadmin', organizationId: null, name: 'Admin' }
})

describe('useCommands', () => {
  it('returns role-filtered commands for current user', () => {
    const { result } = renderHook(() => useCommands())
    expect(result.current.commands.some((c) => c.id === 'nav.dashboard')).toBe(true)
  })

  it('returns empty array when user is not authenticated', () => {
    authUser.user = null
    const { result } = renderHook(() => useCommands())
    expect(result.current.commands).toEqual([])
  })

  it('execute navigates via router.push when href is set', () => {
    const { result } = renderHook(() => useCommands())
    const nav = result.current.commands.find((c) => c.id === 'nav.approvals')!
    act(() => result.current.execute(nav))
    expect(push).toHaveBeenCalledWith('/approvals')
  })

  it('execute runs logout + redirects to /login for logout action', () => {
    const { result } = renderHook(() => useCommands())
    const logoutCmd = result.current.commands.find((c) => c.id === 'system.logout')!
    act(() => result.current.execute(logoutCmd))
    expect(logout).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('execute create-organization navigates to /organizations?create=true', () => {
    const { result } = renderHook(() => useCommands())
    const createCmd = result.current.commands.find((c) => c.id === 'action.create-organization')!
    act(() => result.current.execute(createCmd))
    expect(push).toHaveBeenCalledWith('/organizations?create=true')
  })

  it('execute with unknown action is a no-op', () => {
    const { result } = renderHook(() => useCommands())
    const fake: CommandEntry = {
      id: 'fake.cmd',
      label: 'Fake',
      group: 'actions',
      roles: ['superadmin'],
    }
    expect(() => act(() => result.current.execute(fake))).not.toThrow()
    expect(push).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
  })
})
