import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { ensureTrackingPermissions } from './permissions'
import { initQueue } from './queue'

/**
 * Tracking lifecycle (M5-b, ADR 0007 §1-2, §10).
 *
 * **startTracking** вызывается при успешном `POST /shifts/start`:
 *   1. initQueue — creates SQLite table (idempotent).
 *   2. Cache shift context в AsyncStorage — background TaskManager task
 *      читает его при каждом wake-up (не может получить state от React).
 *   3. ensureTrackingPermissions — foreground + background prompts.
 *   4. Location.startLocationUpdatesAsync с foreground service notification,
 *      accuracy Balanced (battery), distance filter 50m.
 *
 * **stopTracking** вызывается при end / cancel shift:
 *   1. Stop location updates (иначе OS продолжает wake-up'ать app).
 *   2. Clear AsyncStorage context — следующий cold-start не попытается
 *      ingest pings на устаревший shift.
 *
 * **Sampling strategy** (ADR 0007 §1):
 *   - Background: timeInterval 60_000ms + distanceInterval 50m,
 *     Accuracy.Balanced (~100m via WiFi/cell, economical).
 *   - Foreground refinement (more frequent, higher accuracy) — делает
 *     `useForegroundTracking` hook поверх Task'а, не здесь.
 *
 * **iOS compliance** (ADR 0007 §10):
 *   - `showsBackgroundLocationIndicator: true` — blue bar во время tracking,
 *     App Store requirement.
 *   - `activityType: AutomotiveNavigation` — hint OS что это "vehicle",
 *     не pedometer.
 *
 * **Android compliance**:
 *   - `foregroundService` notification — persistent, обязательна для
 *     background tracking Android 10+.
 *   - `notificationColor: '#F97B10'` — brand accent, legitimate use
 *     (platform chrome, не UI).
 */

export const LOCATION_TASK_NAME = 'JUMIX_BACKGROUND_LOCATION'
export const ACTIVE_SHIFT_STORAGE_KEY = 'jumix.tracking.active-shift'

export interface TrackingContext {
  shiftId: string
  site: {
    id: string
    latitude: number
    longitude: number
    geofenceRadiusM: number
  }
  /** Timestamp когда tracking стартовал — purely diagnostic. */
  startedAt: string
}

export async function startTracking(ctx: Omit<TrackingContext, 'startedAt'>): Promise<void> {
  await initQueue()

  const fullCtx: TrackingContext = { ...ctx, startedAt: new Date().toISOString() }
  await AsyncStorage.setItem(ACTIVE_SHIFT_STORAGE_KEY, JSON.stringify(fullCtx))

  // Permission check — throws PermissionDeniedError на отказе.
  await ensureTrackingPermissions()

  // Stop previous tracking на случай если другой shift остался висеть
  // (crash / force-quit recovery). Idempotent.
  const alreadyRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)
  if (alreadyRunning) {
    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
    } catch {
      // ignore — task может быть registered но не running.
    }
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000,
    distanceInterval: 50,
    foregroundService: {
      notificationTitle: 'Jumix отслеживает смену',
      notificationBody: 'Данные используются только во время работы',
      notificationColor: '#F97B10',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
  })
}

export async function stopTracking(): Promise<void> {
  const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)
  if (running) {
    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
    } catch {
      // ignore
    }
  }
  await AsyncStorage.removeItem(ACTIVE_SHIFT_STORAGE_KEY)
}

export async function getActiveTrackingContext(): Promise<TrackingContext | null> {
  const raw = await AsyncStorage.getItem(ACTIVE_SHIFT_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as TrackingContext
  } catch {
    return null
  }
}

/** Test-only: clear. */
export async function __resetTrackingForTests(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_SHIFT_STORAGE_KEY)
}
