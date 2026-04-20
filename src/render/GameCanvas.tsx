import { useEffect, useRef, useState } from 'react'
import type { AudioClock } from '../core/audioClock'
import type { CourseData, FeatureTrack } from '../core/types'
import { featureIndexAtTime } from '../audio/features'
import {
  PLAYER_ANCHOR_X,
  PLAYER_H,
  PLAYER_HALF_W,
  type GameSimState,
  tickSim,
} from '../game/sim'
import type { KeyBindings } from '../input/controlSettings'
import { slotForCode } from '../input/controlSettings'
import { emptyFrameInput, type FrameInput, type GameActionSlot } from '../input/frameInput'
import { TouchControls } from '../ui/TouchControls'

export interface GameCanvasProps {
  clock: AudioClock
  course: CourseData
  features: FeatureTrack
  sim: GameSimState
  bindings: KeyBindings
  showTouchPads: boolean
  onHud?: (s: { alive: boolean; reason: GameSimState['reason'] }) => void
}

/**
 * `requestAnimationFrame` loop: input edges, sim tick, HiDPI canvas, debug draw.
 */
export function GameCanvas({
  clock,
  course,
  features,
  sim,
  bindings,
  showTouchPads,
  onHud,
}: GameCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastNowRef = useRef<number | null>(null)
  const keysDownRef = useRef(new Set<string>())
  const edgeRef = useRef<FrameInput>(emptyFrameInput())
  const lastHudRef = useRef({ alive: sim.alive, reason: sim.reason })

  const [logicalSize, setLogicalSize] = useState({ w: 960, h: 440 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setLogicalSize({
        w: Math.max(280, Math.floor(r.width)),
        h: 440,
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const slot = slotForCode(bindings, e.code)
      if (!slot) return
      if (!keysDownRef.current.has(e.code)) {
        edgeRef.current[slot] = true
        keysDownRef.current.add(e.code)
      }
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current.delete(e.code)
    }
    globalThis.window.addEventListener('keydown', onKeyDown)
    globalThis.window.addEventListener('keyup', onKeyUp)
    return () => {
      globalThis.window.removeEventListener('keydown', onKeyDown)
      globalThis.window.removeEventListener('keyup', onKeyUp)
    }
  }, [bindings])

  const fireTouchSlot = (slot: GameActionSlot) => {
    edgeRef.current[slot] = true
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const freq = new Uint8Array(clock.analyser.frequencyBinCount)
    let raf = 0

    const drawSpectrum = (w: number) => {
      clock.analyser.getByteFrequencyData(freq)
      const bars = 64
      const step = Math.max(1, Math.floor(freq.length / bars))
      const baseY = 118
      const maxH = 90
      ctx.fillStyle = 'rgba(120, 200, 255, 0.35)'
      for (let i = 0; i < bars; i++) {
        let v = 0
        for (let k = 0; k < step; k++) v += freq[i * step + k] ?? 0
        v /= step
        const bh = (v / 255) * maxH
        const bw = (w / bars) * 0.72
        const x = 8 + i * (w / bars)
        ctx.fillRect(x, baseY - bh, bw, bh)
      }
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillText('Live FFT (AnalyserNode)', 10, 24)
    }

    const drawFeatureDebug = (w: number, t: number) => {
      const idx = featureIndexAtTime(features, t)
      const n = Math.min(120, features.rms.length)
      const start = Math.max(0, idx - 40)
      ctx.strokeStyle = 'rgba(255, 200, 120, 0.55)'
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const j = Math.min(features.rms.length - 1, Math.max(0, start + i))
        const v = features.rms[j] ?? 0
        const x = 8 + (i / n) * (w - 16)
        const y = 210 - v * 400
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      const cx = 8 + ((idx - start) / n) * (w - 16)
      ctx.fillStyle = 'rgba(255, 90, 90, 0.9)'
      ctx.fillRect(cx - 1, 168, 2, 52)
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fillText('Offline RMS window (debug)', 10, 158)
    }

    const drawCourse = (scroll: number, _w: number, h: number) => {
      ctx.strokeStyle = 'rgba(230, 240, 255, 0.92)'
      ctx.lineWidth = 2
      ctx.beginPath()
      let started = false
      for (const p of course.ground) {
        const sx = p.x - scroll
        const sy = p.y
        if (!started) {
          ctx.moveTo(sx, sy)
          started = true
        } else ctx.lineTo(sx, sy)
      }
      ctx.stroke()

      for (const o of course.obstacles) {
        const x0 = o.x0 - scroll
        const x1 = o.x1 - scroll
        if (o.kind === 'pit') {
          ctx.fillStyle = 'rgba(255, 60, 60, 0.12)'
          ctx.fillRect(x0, 0, x1 - x0, h)
        } else {
          ctx.strokeStyle = 'rgba(255, 120, 160, 0.55)'
          ctx.strokeRect(x0, 240, x1 - x0, 120)
        }
      }
    }

    const drawPlayer = () => {
      const x = PLAYER_ANCHOR_X
      const y = sim.playerY
      ctx.fillStyle = sim.alive
        ? 'rgba(180, 255, 200, 0.95)'
        : 'rgba(255, 120, 120, 0.85)'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - PLAYER_HALF_W, y + PLAYER_H)
      ctx.lineTo(x + PLAYER_HALF_W, y + PLAYER_H)
      ctx.closePath()
      ctx.fill()
    }

    /** Polilínea tipo ribbon anclada al jugador (MVP vectorial). */
    const drawRibbon = () => {
      const x = PLAYER_ANCHOR_X
      const y = sim.playerY + 8
      const lean = sim.ribbonLean
      const pose = sim.ribbonPose
      const sway = lean * 22
      const lift = 14 + pose * 5
      ctx.strokeStyle = 'rgba(190, 255, 210, 0.82)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 8 + sway * 0.3, y + 4)
      ctx.lineTo(x + sway * 0.55, y - lift * 0.45)
      ctx.lineTo(x + 12 + sway, y - lift)
      ctx.lineTo(x + 6 + sway * 0.4, y - lift * 0.35)
      ctx.lineTo(x - 4 + sway * 0.2, y - 2)
      ctx.closePath()
      ctx.stroke()
    }

    const loop = (now: number) => {
      const lw = logicalSize.w
      const lh = logicalSize.h
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
      const tw = Math.max(1, Math.floor(lw * dpr))
      const th = Math.max(1, Math.floor(lh * dpr))
      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw
        canvas.height = th
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const last = lastNowRef.current ?? now
      const dt = Math.min(0.05, (now - last) / 1000)
      lastNowRef.current = now

      const frame: FrameInput = { ...edgeRef.current }
      edgeRef.current = emptyFrameInput()

      const t = clock.getSimWorldTime()
      const dtSim =
        clock.isSimWorldFrozen() || !clock.isPlaying() ? 0 : dt
      tickSim(sim, course, t, dtSim, frame)

      if (onHud) {
        if (sim.alive !== lastHudRef.current.alive || sim.reason !== lastHudRef.current.reason) {
          lastHudRef.current = { alive: sim.alive, reason: sim.reason }
          onHud({ alive: sim.alive, reason: sim.reason })
        }
      }

      const w = lw
      const h = lh
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(12, 14, 22, 0.96)'
      ctx.fillRect(0, 0, w, h)

      drawSpectrum(w)
      drawFeatureDebug(w, t)
      drawCourse(sim.scroll, w, h)
      drawPlayer()
      drawRibbon()

      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = '12px ui-monospace, monospace'
      ctx.fillText(
        `t=${t.toFixed(2)}s  scroll=${sim.scroll.toFixed(0)}  alive=${sim.alive} (${sim.reason})`,
        10,
        h - 12,
      )

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lastNowRef.current = null
    }
  }, [clock, course, features, sim, logicalSize.w, logicalSize.h, onHud])

  return (
    <div className="game-canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        width={960}
        height={440}
        aria-label="Vista de juego y depuración de audio"
      />
      <TouchControls visible={showTouchPads} onSlot={fireTouchSlot} />
    </div>
  )
}
