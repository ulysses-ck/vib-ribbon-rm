import type { GameActionSlot } from './frameInput'

export const CONTROL_SETTINGS_VERSION = 1 as const
export const CONTROL_STORAGE_KEY = 'vibRibbonRm.controls.v1'

/** Maps logical slots to `KeyboardEvent.code` (e.g. KeyH). */
export type KeyBindings = Record<GameActionSlot, string>

export interface ControlSettings {
  version: typeof CONTROL_SETTINGS_VERSION
  bindings: KeyBindings
}

export const DEFAULT_BINDINGS: KeyBindings = {
  pressH: 'KeyH',
  pressJ: 'KeyJ',
  pressK: 'KeyK',
  pressL: 'KeyL',
}

export function defaultControlSettings(): ControlSettings {
  return {
    version: CONTROL_SETTINGS_VERSION,
    bindings: { ...DEFAULT_BINDINGS },
  }
}

export function loadControlSettings(): ControlSettings {
  try {
    const raw = globalThis.localStorage?.getItem(CONTROL_STORAGE_KEY)
    if (!raw) return defaultControlSettings()
    const parsed = JSON.parse(raw) as Partial<ControlSettings>
    if (parsed.version !== CONTROL_SETTINGS_VERSION || !parsed.bindings) {
      return defaultControlSettings()
    }
    const b = parsed.bindings
    const merged: KeyBindings = { ...DEFAULT_BINDINGS }
    for (const k of Object.keys(DEFAULT_BINDINGS) as GameActionSlot[]) {
      if (typeof b[k] === 'string' && b[k].length > 0) merged[k] = b[k]!
    }
    return { version: CONTROL_SETTINGS_VERSION, bindings: merged }
  } catch {
    return defaultControlSettings()
  }
}

export function saveControlSettings(settings: ControlSettings): void {
  try {
    globalThis.localStorage?.setItem(
      CONTROL_STORAGE_KEY,
      JSON.stringify(settings),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

/** Which action slot (if any) uses this keyboard code. */
export function slotForCode(
  bindings: KeyBindings,
  code: string,
): GameActionSlot | null {
  for (const slot of Object.keys(bindings) as GameActionSlot[]) {
    if (bindings[slot] === code) return slot
  }
  return null
}
