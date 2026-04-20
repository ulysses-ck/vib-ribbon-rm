import { useCallback, useEffect, useRef, useState } from 'react'
import { decodeAudioBuffer } from './audio/decode'
import { computeFeatureTrack } from './audio/features'
import { createAudioClock, type AudioClock } from './core/audioClock'
import type { CourseData, CourseGenParams, FeatureTrack } from './core/types'
import { generateCourse } from './gen/courseGenerator'
import { createSimState, resetSim, type GameSimState } from './game/sim'
import { GameCanvas } from './render/GameCanvas'
import './App.css'

type Screen = 'menu' | 'options' | 'play'

const defaultGenParams = (): CourseGenParams => ({
  seed: 42,
  worldUnitsPerSecond: 200,
  amplitude: 1,
  fluxThreshold: 0.52,
})

export default function App() {
  const [clock, setClock] = useState<AudioClock | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [loadedName, setLoadedName] = useState<string | null>(null)
  const [features, setFeatures] = useState<FeatureTrack | null>(null)
  const [course, setCourse] = useState<CourseData | null>(null)
  const [offsetMs, setOffsetMs] = useState(0)
  const [volume, setVolume] = useState(0.85)
  const [genParams, setGenParams] = useState<CourseGenParams>(defaultGenParams)
  const [ended, setEnded] = useState(false)
  const [playUiTick, setPlayUiTick] = useState(0)

  const [sim] = useState<GameSimState>(() => createSimState())
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const c = createAudioClock()
    c.setOnEnded(() => setEnded(true))
    const id = requestAnimationFrame(() => {
      setClock(c)
    })
    return () => {
      cancelAnimationFrame(id)
      c.setOnEnded(null)
      c.dispose()
    }
  }, [])

  useEffect(() => {
    if (!clock) return
    clock.setOffsetMs(offsetMs)
  }, [clock, offsetMs])

  useEffect(() => {
    if (!clock) return
    clock.setVolume(volume)
  }, [clock, volume])

  useEffect(() => {
    if (screen !== 'play') return
    const id = window.setInterval(() => setPlayUiTick((n) => (n + 1) % 1_000_000), 150)
    return () => window.clearInterval(id)
  }, [screen])

  const rebuildCourse = useCallback(
    (feat: FeatureTrack, params: CourseGenParams) => {
      const next = generateCourse(feat, params)
      setCourse(next)
      resetSim(sim, next)
    },
    [sim],
  )

  const onPickFile = useCallback(
    async (file: File | null) => {
      if (!file || !clock) return
      setEnded(false)
      const buf = await decodeAudioBuffer(clock.context, await file.arrayBuffer())
      clock.setBuffer(buf)
      clock.seek(0)
      const feat = computeFeatureTrack(buf)
      setFeatures(feat)
      setLoadedName(file.name)
      rebuildCourse(feat, genParams)
    },
    [clock, genParams, rebuildCourse],
  )

  const openFilePicker = () => fileInputRef.current?.click()

  const startPlay = async () => {
    if (!clock || !course || !features) return
    setEnded(false)
    resetSim(sim, course)
    clock.seek(0)
    setScreen('play')
    await clock.play()
  }

  const togglePause = useCallback(async () => {
    if (!clock) return
    if (clock.isPlaying()) clock.pause()
    else {
      setEnded(false)
      await clock.play()
    }
  }, [clock])

  if (!clock) {
    return <div className="app-shell">Inicializando audio…</div>
  }

  return (
    <div className="app-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          void onPickFile(f)
          e.target.value = ''
        }}
      />

      <header className="app-header">
        <h1 className="app-title">Vib-Ribbon RM</h1>
        <p className="app-sub">
          React + Vite + canvas — núcleo de audio, pipeline offline y simulación.
        </p>
      </header>

      {screen === 'menu' && (
        <section className="panel">
          <nav className="menu-row">
            <button type="button" className="btn primary" onClick={openFilePicker}>
              Cargar pista
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setScreen('options')}
            >
              Opciones
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!course}
              onClick={() => void startPlay()}
            >
              Iniciar juego
            </button>
          </nav>
          <p className="hint">
            {loadedName ? (
              <>
                Pista: <code>{loadedName}</code> — duración{' '}
                <code>{clock.getDuration().toFixed(1)}s</code>
              </>
            ) : (
              'Elegí un archivo de audio para decodificar y generar el recorrido.'
            )}
          </p>
          <p className="hint keys">En juego: espacio para saltar · P para pausar</p>
        </section>
      )}

      {screen === 'options' && (
        <section className="panel options-panel">
          <h2>Opciones</h2>
          <label className="field">
            <span>Compensación (ms)</span>
            <input
              type="range"
              min={-400}
              max={400}
              value={offsetMs}
              onChange={(e) => setOffsetMs(Number(e.target.value))}
            />
            <output>{offsetMs} ms</output>
          </label>
          <label className="field">
            <span>Volumen</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
            />
            <output>{Math.round(volume * 100)}%</output>
          </label>
          <label className="field">
            <span>Semilla (curso determinista)</span>
            <input
              type="number"
              value={genParams.seed}
              onChange={(e) =>
                setGenParams((p) => ({ ...p, seed: Number(e.target.value) || 0 }))
              }
            />
          </label>
          <label className="field">
            <span>Umbral de flux (obstáculos)</span>
            <input
              type="range"
              min={10}
              max={95}
              value={Math.round(genParams.fluxThreshold * 100)}
              onChange={(e) =>
                setGenParams((p) => ({
                  ...p,
                  fluxThreshold: Number(e.target.value) / 100,
                }))
              }
            />
            <output>{genParams.fluxThreshold.toFixed(2)}</output>
          </label>
          <div className="menu-row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (features) rebuildCourse(features, genParams)
                setScreen('menu')
              }}
            >
              Guardar y volver
            </button>
          </div>
        </section>
      )}

      {screen === 'play' && course && features && (
        <section className="play-panel">
          <div className="play-toolbar" data-ui-tick={playUiTick}>
            <button type="button" className="btn" onClick={() => setScreen('menu')}>
              Menú
            </button>
            <button type="button" className="btn" onClick={() => void togglePause()}>
              {clock.isPlaying() ? 'Pausa' : 'Reproducir'}
            </button>
            <label className="seek">
              <span className="sr-only">Posición</span>
              <input
                type="range"
                min={0}
                max={Math.max(0.001, clock.getDuration())}
                step={0.05}
                value={clock.getBufferTime()}
                onChange={(e) => clock.seek(Number(e.target.value))}
              />
            </label>
            <span className="time-readout" title="Buffer / mundo (con offset)">
              {clock.getBufferTime().toFixed(1)}s / {clock.getDuration().toFixed(1)}s · mundo{' '}
              {clock.getWorldTime().toFixed(2)}s
            </span>
            {ended && <span className="badge">Fin de pista</span>}
          </div>
          <GameCanvas clock={clock} course={course} features={features} sim={sim} />
          <p className="hint keys">
            Espacio: salto · barra: posición (seek en tiempo decodificado; offset en opciones
            afecta el tiempo de mundo)
          </p>
        </section>
      )}

      <GlobalKeyHandler
        enabled={screen === 'play'}
        onPauseToggle={() => void togglePause()}
      />
    </div>
  )
}

function GlobalKeyHandler({
  enabled,
  onPauseToggle,
}: {
  enabled: boolean
  onPauseToggle: () => void
}) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        onPauseToggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, onPauseToggle])
  return null
}
