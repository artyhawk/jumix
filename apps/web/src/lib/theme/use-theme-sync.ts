'use client'

import { updatePreferences } from '@/lib/api/preferences'
import type { ThemeMode } from '@/lib/api/types'
import { useAuthStore } from '@/lib/auth-store'
import { useEffect, useRef } from 'react'
import { writeStoredThemeMode } from './persist'
import { useTheme } from './theme-provider'

/**
 * B3-THEME — sync theme preference между client + server для logged-in
 * пользователей.
 *
 * Поведение:
 *   1. Login (user становится != null + hydrated=true): сравнить
 *      DB.themeMode vs localStorage. Explicit choice (≠ 'system') в
 *      localStorage побеждает DB-default 'system' и пишется в DB. Иначе
 *      DB wins (cross-device consistency) и применяется в provider.
 *   2. После login: при каждом setMode (через ThemeToggle) — fire-and-forget
 *      PATCH /me/preferences. Visual state уже изменился; PATCH ошибки
 *      логируются, но не откатывают (preference-level, low stakes).
 *
 * Single effect (а не два) — чтобы избежать race между first-login sync
 * и toggle-sync, когда первый зашедулил setMode но mode ещё не propagated
 * на момент срабатывания second effect'а в том же render-cycle.
 *
 * lastPushedMode ref — anti-loop: запоминает последнее значение, которое
 * уже на сервере (или в полёте). Mode-change который совпадает с lastPushed
 * = DB-sync echo, не реальный toggle, PATCH skip.
 *
 * Mounted один раз — на root layout под ThemeProvider'ом и AuthProvider'ом.
 */

export function useThemeSync(): void {
  const user = useAuthStore((s) => s.user)
  const authHydrated = useAuthStore((s) => s.hydrated)
  const patchUser = useAuthStore((s) => s.patchUser)
  const { mode, setMode, hydrated: themeHydrated } = useTheme()

  const modeRef = useRef(mode)
  modeRef.current = mode
  const setModeRef = useRef(setMode)
  setModeRef.current = setMode
  const patchUserRef = useRef(patchUser)
  patchUserRef.current = patchUser

  const lastSyncedUserId = useRef<string | null>(null)
  const lastPushedMode = useRef<ThemeMode | null>(null)

  useEffect(() => {
    if (!authHydrated || !themeHydrated) return
    if (!user) {
      lastSyncedUserId.current = null
      lastPushedMode.current = null
      return
    }

    // Fresh user — reconcile localStorage vs DB.
    if (lastSyncedUserId.current !== user.id) {
      lastSyncedUserId.current = user.id
      const dbMode = user.themeMode
      const localMode = modeRef.current

      if (localMode !== 'system' && dbMode === 'system') {
        // Anonymous-toggle wins. Pre-record локально + PATCH в DB.
        lastPushedMode.current = localMode
        updatePreferences({ themeMode: localMode })
          .then((res) => patchUserRef.current(res.user))
          .catch(() => {
            // ignore — preference-level, retry на next toggle.
          })
      } else if (dbMode !== localMode) {
        // DB wins. Pre-record dbMode чтобы следующее срабатывание этого же
        // effect'а (когда mode propagate'ится от setMode) увидело match.
        lastPushedMode.current = dbMode
        setModeRef.current(dbMode)
      } else {
        lastPushedMode.current = localMode
      }
      return
    }

    // Existing user — это либо toggle (push в DB), либо echo от первой sync
    // (mode только что обновился через setModeRef → совпадает с lastPushed).
    if (lastPushedMode.current === null) return
    if (lastPushedMode.current === mode) return
    lastPushedMode.current = mode
    writeStoredThemeMode(mode)
    updatePreferences({ themeMode: mode })
      .then((res) => patchUserRef.current(res.user))
      .catch(() => {
        // ignore
      })
  }, [authHydrated, themeHydrated, user, mode])
}
