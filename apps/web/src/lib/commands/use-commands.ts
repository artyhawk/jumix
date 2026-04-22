'use client'

import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { type CommandEntry, getCommandsForRole } from './registry'

/**
 * Hook собирает role-aware commands для current user и предоставляет execute-handler.
 *
 * `create-organization` action navigates на `/organizations?create=true` —
 * page сама читает query param и открывает dialog. Это проще чем lift state
 * up в shell или писать dedicated Zustand store (§16 CLAUDE.md).
 */
export function useCommands() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const commands = useMemo<CommandEntry[]>(() => {
    if (!user) return []
    return getCommandsForRole(user.role)
  }, [user])

  const execute = useCallback(
    (cmd: CommandEntry) => {
      if (cmd.href) {
        router.push(cmd.href)
        return
      }
      if (cmd.action === 'logout') {
        void logout()
        router.push('/login')
        return
      }
      if (cmd.action === 'create-organization') {
        router.push('/organizations?create=true')
        return
      }
      if (cmd.action === 'create-site') {
        router.push('/sites?create=true')
        return
      }
      if (cmd.action === 'create-crane') {
        router.push('/my-cranes?create=true')
        return
      }
    },
    [router, logout],
  )

  return { commands, execute }
}
