import type { FeatureTrack } from '../core/types'

const N_BANDS = 4 as const

function mixToMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length
  if (buffer.numberOfChannels === 1) {
    const c0 = buffer.getChannelData(0)
    return Float32Array.from(c0)
  }
  const out = new Float32Array(n)
  const gain = 1 / buffer.numberOfChannels
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const cd = buffer.getChannelData(ch)
    for (let i = 0; i < n; i++) out[i] += cd[i] * gain
  }
  return out
}

/** Picos locales de flux separados por al menos `minSepHops` (0–1 por hop). */
export function computeOnsetStrength(
  flux: Float32Array,
  minSepHops = 6,
): Float32Array {
  const n = flux.length
  const out = new Float32Array(n)
  let mx = 1e-9
  for (let i = 0; i < n; i++) mx = Math.max(mx, flux[i]!)
  if (mx < 1e-8) return out
  let last = -minSepHops - 1
  for (let i = 1; i < n - 1; i++) {
    const f = flux[i]!
    if (f < mx * 0.4) continue
    if (!(f >= flux[i - 1]! && f >= flux[i + 1]!)) continue
    if (i - last < minSepHops) continue
    out[i] = Math.min(1, f / mx)
    last = i
  }
  return out
}

function rmsChunk(data: Float32Array, start: number, end: number): number {
  let acc = 0
  const e = Math.min(end, data.length)
  const s = Math.max(0, start)
  const w = Math.max(1, e - s)
  for (let j = s; j < e; j++) {
    const v = data[j]!
    acc += v * v
  }
  return Math.sqrt(acc / w)
}

/**
 * Deterministic features from mono PCM: RMS, flux, and four sub-window
 * energy bands per hop (coarse texture, not a full STFT).
 */
export function computeFeatureTrackFromMono(
  mono: Float32Array,
  sampleRate: number,
  hopDurationSec = 1 / 30,
): FeatureTrack {
  const hopSamples = Math.max(256, Math.floor(sampleRate * hopDurationSec))
  const n = Math.max(1, Math.floor(mono.length / hopSamples))
  const rms = new Float32Array(n)
  const flux = new Float32Array(n)
  const bandEnergy: [
    Float32Array,
    Float32Array,
    Float32Array,
    Float32Array,
  ] = [
    new Float32Array(n),
    new Float32Array(n),
    new Float32Array(n),
    new Float32Array(n),
  ]
  let prev = 0
  for (let i = 0; i < n; i++) {
    const start = i * hopSamples
    const end = Math.min(start + hopSamples, mono.length)
    const c = rmsChunk(mono, start, end)
    rms[i] = c
    flux[i] = Math.abs(c - prev)
    prev = c

    const span = Math.max(1, end - start)
    const q = Math.floor(span / N_BANDS)
    for (let b = 0; b < N_BANDS; b++) {
      const qs = start + b * q
      const qe = b === N_BANDS - 1 ? end : start + (b + 1) * q
      bandEnergy[b]![i] = rmsChunk(mono, qs, qe)
    }
  }
  const onsetStrength = computeOnsetStrength(flux, 6)
  return {
    sampleRate,
    hopDuration: hopSamples / sampleRate,
    rms,
    flux,
    bandEnergy,
    onsetStrength,
  }
}

/**
 * Deterministic RMS + flux + band energies at fixed hop rate (offline).
 */
export function computeFeatureTrack(
  buffer: AudioBuffer,
  hopDurationSec = 1 / 30,
): FeatureTrack {
  const mono = mixToMono(buffer)
  return computeFeatureTrackFromMono(mono, buffer.sampleRate, hopDurationSec)
}

export function featureIndexAtTime(track: FeatureTrack, tSec: number): number {
  const idx = Math.floor(tSec / track.hopDuration)
  return Math.max(0, Math.min(track.rms.length - 1, idx))
}
