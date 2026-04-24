import type { LocationObject } from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { isInsideGeofence } from './geofence'
import { LOCATION_TASK_NAME, getActiveTrackingContext } from './lifecycle'
import { enqueuePing } from './queue'
import { tryFlushQueue } from './sync'

/**
 * Background location task (M5-b, ADR 0007 §1, §7).
 *
 * **Critical:** `TaskManager.defineTask` должен вызываться на module top-level,
 * до первого `Location.startLocationUpdatesAsync`. Expo документирует это
 * требование — OS invoke'ит task-handler из native side, и JS context
 * должен быть bootstrap'нут с уже-registered definition.
 *
 * Handler:
 *   1. Read ACTIVE_SHIFT context from AsyncStorage (React state недоступен
 *      из background).
 *   2. Per incoming LocationObject: compute `insideGeofence` (client-side
 *      Haversine), enqueue в SQLite.
 *   3. tryFlushQueue — opportunistic flush если есть сеть.
 *
 * Error isolation: любой throw из task = crash того background wake-up'а,
 * но не app. Мы обёрнуты try/catch чтобы гарантированно вернуть void к
 * native.
 */

interface LocationTaskData {
  locations: LocationObject[]
}

interface LocationTaskArgs {
  data: LocationTaskData
  error: TaskManager.TaskManagerError | null
}

export async function handleBackgroundLocation(args: LocationTaskArgs): Promise<void> {
  if (args.error) {
    // Background error — logged в native side (Expo TaskManager logs).
    // Отсюда console.error не reachable — NO-OP.
    return
  }
  if (!args.data) return

  const locations = args.data.locations
  if (!Array.isArray(locations) || locations.length === 0) return

  try {
    const ctx = await getActiveTrackingContext()
    if (!ctx) {
      // Tracking был stopped но OS ещё wake'ает. Ignore.
      return
    }

    for (const loc of locations) {
      const accuracy = typeof loc.coords.accuracy === 'number' ? loc.coords.accuracy : null
      const inside = isInsideGeofence(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracyMeters: accuracy,
        },
        ctx.site,
      )
      await enqueuePing(ctx.shiftId, {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracyMeters: accuracy,
        recordedAt: new Date(loc.timestamp).toISOString(),
        insideGeofence: inside,
      })
    }

    // Opportunistic flush — каждый wake-up даёт шанс дрейну очереди.
    await tryFlushQueue(ctx.shiftId)
  } catch {
    // Swallow — background errors не должны crash'ить native host.
  }
}

/**
 * Idempotent registration — защищает от повторного defineTask при
 * hot-reload/dev. In production module load единожды.
 */
function registerBackgroundTask(): void {
  if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) return
  TaskManager.defineTask(LOCATION_TASK_NAME, handleBackgroundLocation)
}

registerBackgroundTask()
