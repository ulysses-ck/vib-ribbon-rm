import type { CourseGenParams } from '../core/types'

export const APP_SETTINGS_KEY = 'vibRibbonRm.app.v1'
export const APP_SETTINGS_VERSION = 1 as const

export interface PersistedAppSettings {
  version: typeof APP_SETTINGS_VERSION
  offsetMs: number
  volume: number
  genParams: CourseGenParams
}

export function defaultPersistedApp(
  genDefaults: CourseGenParams,
): PersistedAppSettings {
  return {
    version: APP_SETTINGS_VERSION,
    offsetMs: 0,
    volume: 0.85,
    genParams: { ...genDefaults },
  }
}

export function loadAppSettings(
  genDefaults: CourseGenParams,
): PersistedAppSettings {
  try {
    const raw = globalThis.localStorage?.getItem(APP_SETTINGS_KEY)
    if (!raw) return defaultPersistedApp(genDefaults)
    const p = JSON.parse(raw) as Partial<PersistedAppSettings>
    if (p.version !== APP_SETTINGS_VERSION || !p.genParams) {
      return defaultPersistedApp(genDefaults)
    }
    return {
      version: APP_SETTINGS_VERSION,
      offsetMs: typeof p.offsetMs === 'number' ? p.offsetMs : 0,
      volume:
        typeof p.volume === 'number'
          ? Math.max(0, Math.min(1, p.volume))
          : 0.85,
      genParams: { ...genDefaults, ...p.genParams },
    }
  } catch {
    return defaultPersistedApp(genDefaults)
  }
}

export function saveAppSettings(settings: PersistedAppSettings): void {
  try {
    globalThis.localStorage?.setItem(APP_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}
