/**
 * User preferences API contracts (B3-THEME).
 *
 * `themeMode` — единственная preference в MVP. Когда появится >1
 * (notifications opt-in, density, etc.) — вынесем в `user_preferences` JSONB
 * на db-уровне; здесь просто расширим payload.
 */

export const THEME_MODES = ['light', 'dark', 'system'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const THEME_MODE_DEFAULT: ThemeMode = 'system'

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
}

export interface UpdatePreferencesPayload {
  themeMode: ThemeMode
}
