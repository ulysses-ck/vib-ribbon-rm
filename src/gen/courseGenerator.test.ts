import { describe, expect, it } from 'vitest'
import type { FeatureTrack } from '../core/types'
import { generateCourse } from './courseGenerator'

function makeTrack(n: number): FeatureTrack {
  const rms = new Float32Array(n).fill(0.1)
  const flux = new Float32Array(n)
  for (let i = 0; i < n; i++) flux[i] = i % 5 === 0 ? 0.9 : 0.05
  const bandEnergy: FeatureTrack['bandEnergy'] = [
    new Float32Array(n).fill(0.02),
    new Float32Array(n).fill(0.02),
    new Float32Array(n).fill(0.02),
    new Float32Array(n).fill(0.02),
  ]
  return {
    sampleRate: 44100,
    hopDuration: 1 / 30,
    rms,
    flux,
    bandEnergy,
  }
}

describe('generateCourse', () => {
  it('is deterministic for same seed and track', () => {
    const track = makeTrack(40)
    const params = {
      seed: 777,
      worldUnitsPerSecond: 120,
      amplitude: 1,
      fluxThreshold: 0.35,
      minObstacleGapWorld: 80,
    }
    const a = generateCourse(track, params)
    const b = generateCourse(track, params)
    expect(a.length).toBe(b.length)
    expect(a.ground.length).toBe(b.ground.length)
    expect(a.obstacles.length).toBe(b.obstacles.length)
    for (let i = 0; i < a.ground.length; i++) {
      expect(a.ground[i]!.x).toBeCloseTo(b.ground[i]!.x, 5)
      expect(a.ground[i]!.y).toBeCloseTo(b.ground[i]!.y, 5)
    }
  })

  it('changes with different seed', () => {
    const track = makeTrack(60)
    const base = {
      worldUnitsPerSecond: 100,
      amplitude: 1,
      fluxThreshold: 0.2,
      minObstacleGapWorld: 40,
    }
    const a = generateCourse(track, { ...base, seed: 1 })
    const b = generateCourse(track, { ...base, seed: 2 })
    const ay = a.ground[10]!.y
    const by = b.ground[10]!.y
    expect(ay === by).toBe(false)
  })
})
