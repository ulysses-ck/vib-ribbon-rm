import type { CourseData, CourseObstacle } from '../core/types'
import type { FrameInput } from '../input/frameInput'

export const GRAVITY = 1850
export const JUMP_V = -620
export const SCROLL_SPEED = 210
export const PLAYER_HALF_W = 14
export const PLAYER_H = 36
/** Player world X = scroll + this anchor (scroll grows with time). */
export const PLAYER_ANCHOR_X = 140

/**
 * Ribbon MVP: K salto; H/L inclinan `ribbonLean`; J rota `ribbonPose` (0–3).
 * Pose 2–3 achatan la hitbox de pinchos (pie “más alto” = más margen).
 */
export interface GameSimState {
  scroll: number
  playerY: number
  playerVy: number
  alive: boolean
  reason: 'playing' | 'pit' | 'spike' | 'bounds'
  ribbonPose: number
  /** -1 izquierda … 1 derecha; decae cuando no hay input. */
  ribbonLean: number
}

export function createSimState(): GameSimState {
  return {
    scroll: 0,
    playerY: 260,
    playerVy: 0,
    alive: true,
    reason: 'playing',
    ribbonPose: 0,
    ribbonLean: 0,
  }
}

/** Reducción virtual del pie para test de pinchos según pose (px). */
export function spikeFootClearance(state: GameSimState): number {
  if (state.ribbonPose === 2) return 24
  if (state.ribbonPose === 3) return 14
  if (state.ribbonPose === 1) return 8
  return 0
}

/** Linear interpolate ground Y; returns null if `x` lies in a pit hazard. */
export function sampleGroundY(
  course: CourseData,
  x: number,
): { y: number } | null {
  for (const o of course.obstacles) {
    if (o.kind === 'pit' && x >= o.x0 && x <= o.x1) return null
  }
  const g = course.ground
  if (g.length === 0) return { y: 400 }
  if (x <= g[0]!.x) return { y: g[0]!.y }
  if (x >= g[g.length - 1]!.x) return { y: g[g.length - 1]!.y }
  for (let i = 0; i < g.length - 1; i++) {
    const a = g[i]!
    const b = g[i + 1]!
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / Math.max(1e-6, b.x - a.x)
      return { y: a.y + t * (b.y - a.y) }
    }
  }
  return { y: g[g.length - 1]!.y }
}

function groundYAt(course: CourseData, x: number): number {
  return sampleGroundY(course, x)?.y ?? 9999
}

function spikeHit(
  course: CourseData,
  px: number,
  footY: number,
  footClearance: number,
): CourseObstacle | null {
  const foot = footY - footClearance
  for (const o of course.obstacles) {
    if (o.kind !== 'spike') continue
    if (px < o.x0 || px > o.x1) continue
    const gy = groundYAt(course, px)
    if (foot > gy - o.clearance + 8 && foot <= gy + 12) return o
  }
  return null
}

/**
 * Advance simulation by `dtSec` using `worldTimeSec` for scroll position.
 * `pressK` salto; `pressJ` cicla pose; `pressH`/`pressL` empujan ribbonLean.
 */
export function tickSim(
  state: GameSimState,
  course: CourseData,
  worldTimeSec: number,
  dtSec: number,
  input: FrameInput,
): void {
  if (!state.alive) return
  const jumpRequested = input.pressK

  if (input.pressJ) {
    state.ribbonPose = (state.ribbonPose + 1) % 4
  }
  if (input.pressH) {
    state.ribbonLean = Math.max(-1, state.ribbonLean - 0.42)
  }
  if (input.pressL) {
    state.ribbonLean = Math.min(1, state.ribbonLean + 0.42)
  }
  if (dtSec > 0) {
    state.ribbonLean *= Math.exp(-4.2 * dtSec)
    if (Math.abs(state.ribbonLean) < 0.02) state.ribbonLean = 0
  }

  state.scroll = worldTimeSec * SCROLL_SPEED
  const px = state.scroll + PLAYER_ANCHOR_X
  const support = sampleGroundY(course, px)
  const maxFoot = support ? support.y : Number.POSITIVE_INFINITY
  const foot0 = state.playerY + PLAYER_H
  const grounded =
    support &&
    foot0 >= maxFoot - 12 &&
    foot0 <= maxFoot + 18 &&
    state.playerVy >= -140

  if (jumpRequested && grounded) {
    state.playerVy = JUMP_V
  }

  state.playerVy += GRAVITY * dtSec
  state.playerY += state.playerVy * dtSec

  if (support) {
    const foot = state.playerY + PLAYER_H
    if (foot >= maxFoot && state.playerVy >= 0) {
      state.playerY = maxFoot - PLAYER_H
      state.playerVy = 0
    }
  } else {
    if (state.playerY + PLAYER_H > 900) {
      state.alive = false
      state.reason = 'pit'
    }
  }

  const foot = state.playerY + PLAYER_H
  const clear = spikeFootClearance(state)
  if (spikeHit(course, px, foot, clear)) {
    state.alive = false
    state.reason = 'spike'
  }

  if (state.playerY < -200 || state.playerY > 1200) {
    state.alive = false
    state.reason = 'bounds'
  }
}

export function resetSim(state: GameSimState, course: CourseData): void {
  const g0 = course.ground[0]?.y ?? 320
  state.scroll = 0
  state.playerY = g0 - PLAYER_H - 2
  state.playerVy = 0
  state.alive = true
  state.reason = 'playing'
  state.ribbonPose = 0
  state.ribbonLean = 0
}
