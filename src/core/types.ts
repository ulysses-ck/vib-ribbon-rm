export interface Vec2 {
  x: number
  y: number
}

/** Offline feature columns aligned to fixed hops (deterministic). */
export interface FeatureTrack {
  sampleRate: number
  hopDuration: number
  rms: Float32Array
  flux: Float32Array
  /** Four coarse band energies per hop (same length as `rms`). */
  bandEnergy: [Float32Array, Float32Array, Float32Array, Float32Array]
}

export type ObstacleKind = 'pit' | 'spike'

export interface CourseObstacle {
  kind: ObstacleKind
  x0: number
  x1: number
  /** For spike: extra height above baseline floor. */
  clearance: number
}

export interface CourseData {
  /** World X extent of the ground polyline. */
  length: number
  ground: Vec2[]
  obstacles: CourseObstacle[]
}

export interface CourseGenParams {
  seed: number
  /** Horizontal scale: world units per second of audio. */
  worldUnitsPerSecond: number
  /** Vertical amplitude for ground undulation (world units). */
  amplitude: number
  /** Obstacle density driven by normalized flux above this threshold. */
  fluxThreshold: number
  /** Minimum world X between obstacle placements. */
  minObstacleGapWorld: number
}
