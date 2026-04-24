import * as Location from 'expo-location'
import { Alert, Linking } from 'react-native'

/**
 * Permission flow для GPS tracking (M5-b, ADR 0007 §10).
 *
 * Sequence:
 *   1. Foreground permission — base prerequisite.
 *   2. Background permission — **обязателен** для shift tracking (смена
 *      идёт когда app в background / screen off / device killed).
 *   3. На denial: Alert с "Открыть настройки" — single-tap к Settings.app
 *      / Android App Settings.
 *
 * iOS/Android particulars:
 *   - iOS 14+: user может grant "Allow Once" / "While Using App" / "Always".
 *     "Always" = full background; "While Using" = только когда screen on.
 *     Наш tracking требует Always (operator кладёт телефон в карман).
 *   - Android 10+: foreground + background = два separate prompt'а.
 *     Android 12+: user может grant "Approximate" вместо "Precise" →
 *     GPS точность хуже, но tracking работает.
 *
 * Не в scope M5-b: user-education screen «зачем приложению full
 * background» (backlog — первое running app usage полевое feedback).
 */

export class PermissionDeniedError extends Error {
  readonly kind: 'foreground' | 'background'
  constructor(kind: 'foreground' | 'background') {
    super(`Location permission denied: ${kind}`)
    this.name = 'PermissionDeniedError'
    this.kind = kind
  }
}

/**
 * Запрашивает оба уровня permission'ов. Throws PermissionDeniedError на
 * первом отказе. Caller показывает Alert с Settings CTA.
 */
export async function ensureTrackingPermissions(): Promise<void> {
  const { status: fg } = await Location.requestForegroundPermissionsAsync()
  if (fg !== 'granted') {
    throw new PermissionDeniedError('foreground')
  }
  const { status: bg } = await Location.requestBackgroundPermissionsAsync()
  if (bg !== 'granted') {
    throw new PermissionDeniedError('background')
  }
}

/**
 * UX helper: показывает native Alert с "Настройки" кнопкой. Вызывать в
 * catch-блоке вокруг ensureTrackingPermissions().
 */
export function showPermissionAlert(kind: 'foreground' | 'background'): void {
  const body =
    kind === 'foreground'
      ? 'Jumix не сможет отслеживать смены без доступа к местоположению. Разрешите в настройках.'
      : 'Для отслеживания смены в фоне приложению нужен постоянный доступ к местоположению (Always/«Всегда»). Откройте настройки чтобы включить.'
  Alert.alert('Нет доступа к местоположению', body, [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Открыть настройки', onPress: () => void Linking.openSettings() },
  ])
}

/** Read-only check без prompt'а — для feature-detect UI states. */
export async function getTrackingPermissionStatus(): Promise<{
  foreground: Location.PermissionStatus
  background: Location.PermissionStatus
}> {
  const fg = await Location.getForegroundPermissionsAsync()
  const bg = await Location.getBackgroundPermissionsAsync()
  return { foreground: fg.status, background: bg.status }
}
