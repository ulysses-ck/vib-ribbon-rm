import { describe, expect, it } from 'vitest'
import type { CourseData } from '../core/types'
import { emptyFrameInput } from '../input/frameInput'
import {
  createSimState,
  resetSim,
  sampleGroundY,
  tickSim,
} from './sim'

describe('sampleGroundY', () => {
  it('returns null inside pit range', () => {
    const course: CourseData = {
      length: 500,
      ground: [
        { x: 0, y: 300 },
        { x: 500, y: 300 },
      ],
      obstacles: [{ kind: 'pit', x0: 100, x1: 200, clearance: 0 }],
    }
    expect(sampleGroundY(course, 50)?.y).toBe(300)
    expect(sampleGroundY(course, 150)).toBeNull()
    expect(sampleGroundY(course, 250)?.y).toBe(300)
  })
})

describe('tickSim', () => {
  it('applies jump when pressK on ground', () => {
    const course: CourseData = {
      length: 2000,
      ground: [
        { x: 0, y: 320 },
        { x: 2000, y: 320 },
      ],
      obstacles: [],
    }
    const state = createSimState()
    resetSim(state, course)
    const input = emptyFrameInput()
    input.pressK = true
    tickSim(state, course, 0, 1 / 60, input)
    expect(state.playerVy).toBeLessThan(0)
  })

  it('ignores jump in air without ground', () => {
    const course: CourseData = {
      length: 2000,
      ground: [
        { x: 0, y: 320 },
        { x: 2000, y: 320 },
      ],
      obstacles: [{ kind: 'pit', x0: 0, x1: 2000, clearance: 0 }],
    }
    const state = createSimState()
    state.playerY = 100
    state.playerVy = -400
    const input = emptyFrameInput()
    input.pressK = true
    const vyBefore = state.playerVy
    tickSim(state, course, 0.5, 1 / 60, input)
    expect(state.playerVy).toBeGreaterThan(vyBefore - 50)
  })
})
