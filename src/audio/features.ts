import type { FeatureTrack } from '../core/types'

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

/**
 * Deterministic RMS + spectral-flux-ish series at fixed hop rate (offline).
 * Intended for course generation and debug overlays independent of live FFT.
 */
export function computeFeatureTrack(
  buffer: AudioBuffer,
  hopDurationSec = 1 / 30,
): FeatureTrack {
  const sr = buffer.sampleRate
  const mono = mixToMono(buffer)
  const hopSamples = Math.max(256, Math.floor(sr * hopDurationSec))
  const n = Math.max(1, Math.floor(mono.length / hopSamples))
  const rms = new Float32Array(n)
  const flux = new Float32Array(n)
  let prev = 0
  for (let i = 0; i < n; i++) {
    const start = i * hopSamples
    let acc = 0
    const end = Math.min(start + hopSamples, mono.length)
    const w = end - start
    for (let j = start; j < end; j++) {
      const v = mono[j]
      acc += v * v
    }
    const c = Math.sqrt(acc / Math.max(1, w))
    rms[i] = c
    flux[i] = Math.abs(c - prev)
    prev = c
  }
  return {
    sampleRate: sr,
    hopDuration: hopSamples / sr,
    rms,
    flux,
  }
}

export function featureIndexAtTime(track: FeatureTrack, tSec: number): number {
  const idx = Math.floor(tSec / track.hopDuration)
  return Math.max(0, Math.min(track.rms.length - 1, idx))
}
