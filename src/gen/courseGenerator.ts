import type {
  CourseData,
  CourseGenParams,
  CourseObstacle,
  FeatureTrack,
  Vec2,
} from '../core/types'

/** Deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function maxFlux(track: FeatureTrack): number {
  let m = 1e-9
  for (let i = 0; i < track.flux.length; i++) m = Math.max(m, track.flux[i]!)
  return m
}

function maxBandSum(track: FeatureTrack, i: number): number {
  let s = 1e-9
  for (let b = 0; b < 4; b++) s = Math.max(s, track.bandEnergy[b]![i] ?? 0)
  return s
}

/**
 * Maps feature columns to a ground polyline + hazards.
 * Same inputs ⇒ same `CourseData`.
 */
export function generateCourse(
  track: FeatureTrack,
  params: CourseGenParams,
): CourseData {
  const rng = mulberry32(params.seed)
  const n = track.rms.length
  const dx = track.hopDuration * params.worldUnitsPerSecond
  const mf = maxFlux(track)
  const ground: Vec2[] = []
  const obstacles: CourseObstacle[] = []
  const baseline = 320
  let lastObstacleEnd = -Number.MAX_VALUE
  const minGap = params.minObstacleGapWorld

  for (let i = 0; i < n; i++) {
    const x = i * dx
    const e = track.rms[i] ?? 0
    const fl = track.flux[i] ?? 0
    const norm = mf > 0 ? fl / mf : 0
    const bandMix = maxBandSum(track, i)
    const wobble =
      Math.sin(i * 0.31 + params.seed * 0.001) * 0.35 +
      (rng() - 0.5) * 0.6 * e * 12 +
      (rng() - 0.5) * bandMix * 28
    const y = baseline + e * params.amplitude * 40 + wobble * 20
    ground.push({ x, y })

    const canSpawn = x - lastObstacleEnd >= minGap
    if (canSpawn && norm > params.fluxThreshold && rng() > 0.72) {
      const width = 48 + rng() * 100
      if (rng() < 0.48) {
        const o: CourseObstacle = {
          kind: 'pit',
          x0: x + rng() * dx * 0.5,
          x1: x + width,
          clearance: 0,
        }
        obstacles.push(o)
        lastObstacleEnd = Math.max(lastObstacleEnd, o.x1)
      } else {
        const o: CourseObstacle = {
          kind: 'spike',
          x0: x + rng() * dx * 0.3,
          x1: x + width * 0.65,
          clearance: 55 + rng() * 110,
        }
        obstacles.push(o)
        lastObstacleEnd = Math.max(lastObstacleEnd, o.x1)
      }
    }
  }

  const length = Math.max(dx, (n - 1) * dx)
  return { length, ground, obstacles }
}
