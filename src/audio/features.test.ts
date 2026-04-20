import { describe, expect, it } from 'vitest'
import { computeFeatureTrackFromMono, featureIndexAtTime } from './features'

describe('computeFeatureTrackFromMono', () => {
  it('produces stable hop count and shapes for silence', () => {
    const sr = 48000
    const mono = new Float32Array(sr)
    const t = computeFeatureTrackFromMono(mono, sr, 1 / 30)
    expect(t.sampleRate).toBe(sr)
    expect(t.rms.length).toBe(t.flux.length)
    expect(t.bandEnergy[0]!.length).toBe(t.rms.length)
    expect(t.rms.every((v) => v === 0)).toBe(true)
    expect(t.flux[0]).toBe(0)
  })

  it('indexes time into hop window', () => {
    const sr = 3000
    const mono = new Float32Array(sr).fill(0.5)
    const t = computeFeatureTrackFromMono(mono, sr, 0.1)
    expect(featureIndexAtTime(t, 0)).toBe(0)
    expect(featureIndexAtTime(t, 999)).toBe(t.rms.length - 1)
  })
})
