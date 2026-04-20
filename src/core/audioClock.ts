import { fadeScheduleEndDelayMs } from './gainRamp'

/** Narrow public surface used by UI and render loop. */
export interface AudioClock {
  readonly context: AudioContext
  readonly analyser: AnalyserNode
  setOnEnded(handler: (() => void) | null): void
  setBuffer(audioBuffer: AudioBuffer): void
  getBuffer(): AudioBuffer | null
  getDuration(): number
  setOffsetMs(ms: number): void
  getOffsetMs(): number
  setVolume(linear: number): void
  getVolume(): number
  getWorldTime(): number
  /**
   * Tiempo de mundo para la simulación: fijo durante fundido de pausa para no
   * avanzar el scroll mientras el audio baja de volumen.
   */
  getSimWorldTime(): number
  /** True durante el fundido de pausa: el mundo no debe avanzar por dt. */
  isSimWorldFrozen(): boolean
  /** Tiempo en el buffer decodificado (sin offset de compensación). */
  getBufferTime(): number
  isPlaying(): boolean
  play(): Promise<void>
  pause(): void
  /** Baja el volumen en rampa y luego pausa (no corta brusco el buffer). */
  pauseWithFade(durationMs?: number): Promise<void>
  seek(seconds: number): void
  dispose(): void
}

/**
 * Web Audio clock: buffer playback through AnalyserNode → Gain → destination.
 * World time = clamped audio position + offsetMs (for manual latency compensation).
 */
export class AudioClockImpl implements AudioClock {
  readonly context: AudioContext
  readonly analyser: AnalyserNode
  private readonly gain: GainNode
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  /** Buffer time (s) at the moment `playStartContextTime` was captured. */
  private bufferOffsetAtStart = 0
  private playStartContextTime = 0
  /** Exact buffer position when paused (seconds). */
  private pausePosition = 0
  private playing = false
  private offsetMs = 0
  private onEnded: (() => void) | null = null
  /** Volumen lineal elegido por el usuario (0–1); el nodo gain puede animarse durante fundidos. */
  private userGainLinear = 0.85
  private fadeTimeoutId: ReturnType<typeof setTimeout> | null = null
  /** Mientras hay fundido de pausa activo, el scroll del juego usa este instante. */
  private simWorldHoldSec: number | null = null

  constructor() {
    this.context = new AudioContext()
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.72
    this.gain = this.context.createGain()
    this.gain.gain.value = this.userGainLinear
    this.analyser.connect(this.gain)
    this.gain.connect(this.context.destination)
  }

  private cancelFadeTimeout(): void {
    if (this.fadeTimeoutId !== null) {
      clearTimeout(this.fadeTimeoutId)
      this.fadeTimeoutId = null
    }
  }

  setOnEnded(handler: (() => void) | null): void {
    this.onEnded = handler
  }

  setBuffer(audioBuffer: AudioBuffer): void {
    this.cancelFadeTimeout()
    this.simWorldHoldSec = null
    this.stopSourceIfAny()
    this.buffer = audioBuffer
    this.pausePosition = 0
    this.playing = false
    this.applyUserGainImmediate()
  }

  getBuffer(): AudioBuffer | null {
    return this.buffer
  }

  getDuration(): number {
    return this.buffer?.duration ?? 0
  }

  setOffsetMs(ms: number): void {
    this.offsetMs = ms
  }

  getOffsetMs(): number {
    return this.offsetMs
  }

  setVolume(linear: number): void {
    this.userGainLinear = Math.max(0, Math.min(1, linear))
    this.cancelFadeTimeout()
    this.applyUserGainImmediate()
  }

  getVolume(): number {
    return this.userGainLinear
  }

  private applyUserGainImmediate(): void {
    const g = this.gain.gain
    const t = this.context.currentTime
    g.cancelScheduledValues(t)
    g.setValueAtTime(this.userGainLinear, t)
  }

  /**
   * Seconds aligned to gameplay: raw decode timeline + offset.
   * Still clamped to [0, duration].
   */
  getWorldTime(): number {
    const d = this.getDuration()
    if (d <= 0) return 0
    const raw = this.getAudioPositionSeconds()
    const shifted = raw + this.offsetMs / 1000
    return Math.max(0, Math.min(d, shifted))
  }

  getSimWorldTime(): number {
    if (this.simWorldHoldSec !== null) return this.simWorldHoldSec
    return this.getWorldTime()
  }

  isSimWorldFrozen(): boolean {
    return this.simWorldHoldSec !== null
  }

  getBufferTime(): number {
    const d = this.getDuration()
    if (d <= 0) return 0
    return Math.max(0, Math.min(d, this.getAudioPositionSeconds()))
  }

  private getAudioPositionSeconds(): number {
    if (!this.buffer) return 0
    if (this.playing) {
      return (
        this.bufferOffsetAtStart +
        (this.context.currentTime - this.playStartContextTime)
      )
    }
    return this.pausePosition
  }

  isPlaying(): boolean {
    return this.playing
  }

  async play(): Promise<void> {
    if (!this.buffer) return
    await this.context.resume()
    if (this.playing) return
    this.cancelFadeTimeout()
    this.simWorldHoldSec = null
    this.applyUserGainImmediate()
    this.startSourceFrom(this.pausePosition)
  }

  pause(): void {
    if (!this.buffer || !this.playing) return
    this.cancelFadeTimeout()
    let pos =
      this.bufferOffsetAtStart +
      (this.context.currentTime - this.playStartContextTime)
    pos = Math.max(0, Math.min(pos, this.buffer.duration))
    this.pausePosition = pos
    this.stopSourceIfAny()
    this.simWorldHoldSec = null
    this.applyUserGainImmediate()
  }

  pauseWithFade(durationMs = 480): Promise<void> {
    if (!this.buffer || !this.playing) {
      return Promise.resolve()
    }
    this.simWorldHoldSec = this.getWorldTime()
    this.cancelFadeTimeout()
    const g = this.gain.gain
    const now = this.context.currentTime
    const durSec = Math.max(0.04, durationMs / 1000)
    g.cancelScheduledValues(now)
    const v0 = Math.min(g.value, this.userGainLinear)
    g.setValueAtTime(v0, now)
    g.linearRampToValueAtTime(0, now + durSec)

    return new Promise((resolve) => {
      this.fadeTimeoutId = setTimeout(() => {
        this.fadeTimeoutId = null
        this.pause()
        resolve(undefined)
      }, fadeScheduleEndDelayMs(durationMs))
    })
  }

  seek(seconds: number): void {
    if (!this.buffer) return
    this.cancelFadeTimeout()
    this.simWorldHoldSec = null
    const t = Math.max(0, Math.min(seconds, this.buffer.duration))
    this.pausePosition = t
    if (this.playing) {
      this.stopSourceIfAny()
      this.applyUserGainImmediate()
      this.startSourceFrom(t)
    }
  }

  private startSourceFrom(offsetInBuffer: number): void {
    if (!this.buffer) return
    this.stopSourceIfAny()
    const src = this.context.createBufferSource()
    src.buffer = this.buffer
    src.connect(this.analyser)
    this.bufferOffsetAtStart = offsetInBuffer
    this.playStartContextTime = this.context.currentTime
    const remaining = Math.max(0, this.buffer.duration - offsetInBuffer)
    if (remaining <= 0) {
      this.pausePosition = this.buffer.duration
      this.playing = false
      this.onEnded?.()
      return
    }
    src.start(0, offsetInBuffer, remaining)
    src.onended = () => {
      if (this.source !== src) return
      this.playing = false
      this.pausePosition = this.buffer!.duration
      this.source = null
      this.onEnded?.()
    }
    this.source = src
    this.playing = true
  }

  private stopSourceIfAny(): void {
    if (!this.source) return
    try {
      this.source.stop()
    } catch {
      /* already stopped */
    }
    this.source.disconnect()
    this.source = null
    this.playing = false
  }

  dispose(): void {
    this.cancelFadeTimeout()
    this.simWorldHoldSec = null
    this.stopSourceIfAny()
    void this.context.close()
  }
}

export function createAudioClock(): AudioClock {
  return new AudioClockImpl()
}
