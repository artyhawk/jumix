/**
 * Toast wrapper с graceful fallback (M1+).
 *
 * `burnt` показывает native iOS HUD / Android system toast — приятный UX
 * на dev-build / production builds. Но в **Expo Go** native module
 * `Burnt` не зарегистрирован, и `import 'burnt'` падает с
 * `Cannot find native module 'Burnt'`.
 *
 * Этот модуль:
 *   - lazy-require'ит `burnt` через try/catch
 *   - при missing-module → fallback на console.log + RN `Alert` для error
 *   - same API surface как `Burnt.toast` (subset который мы используем)
 *
 * Production / dev-client builds — toast работает как раньше; Expo Go
 * — текстовый fallback в консоли + Alert на критичных ошибках.
 */

import { Alert } from 'react-native'

type ToastPreset = 'done' | 'error' | 'none'

interface ToastOptions {
  title: string
  message?: string
  preset?: ToastPreset
}

// biome-ignore lint/suspicious/noExplicitAny: lazy-required burnt module — typed surface unknown
let burntModule: any = null
try {
  // Lazy require — на Expo Go без native modules бросит на этом import'е.
  // require внутри try/catch ловит синхронный throw.
  burntModule = require('burnt')
} catch {
  // native модуль не зарегистрирован (Expo Go) — fallback ниже.
}

export function toast(opts: ToastOptions): void {
  if (burntModule?.toast) {
    try {
      burntModule.toast(opts)
      return
    } catch {
      // Burnt был импортирован но native call упал — fallthrough.
    }
  }
  // Fallback для Expo Go / missing native module.
  const line = opts.message ? `${opts.title} — ${opts.message}` : opts.title
  if (opts.preset === 'error') {
    // Error важно показать пользователю, даже без native toast.
    Alert.alert(opts.title, opts.message)
    return
  }
  // biome-ignore lint/suspicious/noConsole: Expo Go fallback — native toast недоступен
  console.log(`[toast] ${line}`)
}
