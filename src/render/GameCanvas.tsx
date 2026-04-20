import { useEffect, useRef } from 'react'
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

export interface GameCanvasProps {
  clock: AudioClock
  course: CourseData
  features: FeatureTrack
  sim: GameSimState
}

/**
 * Single `requestAnimationFrame` loop: sim tick + debug FFT + course polyline + player.
 */
export function GameCanvas({ clock, course, features, sim }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const jumpRef = useRef(false)
  const lastNowRef = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        jumpRef.current = true
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

    const drawCourse = (scroll: number) => {
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
          ctx.fillRect(x0, 0, x1 - x0, canvas.height)
        } else {
          ctx.strokeStyle = 'rgba(255, 120, 160, 0.55)'
          ctx.strokeRect(x0, 240, x1 - x0, 120)
        }
      }
    }

    const drawPlayer = () => {
      const x = PLAYER_ANCHOR_X
      const y = sim.playerY
      ctx.fillStyle = sim.alive ? 'rgba(180, 255, 200, 0.95)' : 'rgba(255, 120, 120, 0.85)'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - PLAYER_HALF_W, y + PLAYER_H)
      ctx.lineTo(x + PLAYER_HALF_W, y + PLAYER_H)
      ctx.closePath()
      ctx.fill()
    }

    const loop = (now: number) => {
      const last = lastNowRef.current ?? now
      const dt = Math.min(0.05, (now - last) / 1000)
      lastNowRef.current = now

      const t = clock.getWorldTime()
      const jump = jumpRef.current
      jumpRef.current = false
      tickSim(sim, course, t, dt, jump)

      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(12, 14, 22, 0.96)'
      ctx.fillRect(0, 0, w, h)

      drawSpectrum(w)
      drawFeatureDebug(w, t)
      drawCourse(sim.scroll)
      drawPlayer()

      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = '12px ui-monospace, monospace'
      ctx.fillText(`t=${t.toFixed(2)}s  scroll=${sim.scroll.toFixed(0)}  alive=${sim.alive} (${sim.reason})`, 10, h - 12)

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lastNowRef.current = null
    }
  }, [clock, course, features, sim])

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas"
      width={960}
      height={440}
      role="img"
      aria-label="Game view with audio debug and course"
    />
  )
}
