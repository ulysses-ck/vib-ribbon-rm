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
  /** Tiempo en el buffer decodificado (sin offset de compensación). */
  getBufferTime(): number
  isPlaying(): boolean
  play(): Promise<void>
  pause(): void
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

  constructor() {
    this.context = new AudioContext()
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.72
    this.gain = this.context.createGain()
    this.gain.gain.value = 0.85
    this.analyser.connect(this.gain)
    this.gain.connect(this.context.destination)
  }

  setOnEnded(handler: (() => void) | null): void {
    this.onEnded = handler
  }

  setBuffer(audioBuffer: AudioBuffer): void {
    this.stopSourceIfAny()
    this.buffer = audioBuffer
    this.pausePosition = 0
    this.playing = false
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
    this.gain.gain.value = Math.max(0, Math.min(1, linear))
  }

  getVolume(): number {
    return this.gain.gain.value
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
    this.startSourceFrom(this.pausePosition)
  }

  pause(): void {
    if (!this.buffer || !this.playing) return
    let pos =
      this.bufferOffsetAtStart +
      (this.context.currentTime - this.playStartContextTime)
    pos = Math.max(0, Math.min(pos, this.buffer.duration))
    this.pausePosition = pos
    this.stopSourceIfAny()
  }

  seek(seconds: number): void {
    if (!this.buffer) return
    const t = Math.max(0, Math.min(seconds, this.buffer.duration))
    this.pausePosition = t
    if (this.playing) {
      this.stopSourceIfAny()
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
    this.stopSourceIfAny()
    void this.context.close()
  }
}

export function createAudioClock(): AudioClock {
  return new AudioClockImpl()
}
