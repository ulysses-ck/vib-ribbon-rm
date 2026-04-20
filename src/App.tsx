import { useCallback, useEffect, useRef, useState } from 'react'
import { decodeAudioBuffer } from './audio/decode'
import { computeFeatureTrack } from './audio/features'
import { createAudioClock, type AudioClock } from './core/audioClock'
import type { CourseData, CourseGenParams, FeatureTrack } from './core/types'
import { generateCourse } from './gen/courseGenerator'
import { createSimState, resetSim, type GameSimState } from './game/sim'
import {
  defaultControlSettings,
  loadControlSettings,
  saveControlSettings,
  type ControlSettings,
} from './input/controlSettings'
import type { GameActionSlot } from './input/frameInput'
import { GameCanvas } from './render/GameCanvas'
import { useTouchUi } from './ui/useTouchUi'
import './App.css'

type Screen = 'menu' | 'options' | 'play'

const SLOT_LABEL: Record<GameActionSlot, string> = {
  pressH: 'H — hueco / forma (reservado)',
  pressJ: 'J — forma (reservado)',
  pressK: 'K — salto',
  pressL: 'L — forma (reservado)',
}

const defaultGenParams = (): CourseGenParams => ({
  seed: 42,
  worldUnitsPerSecond: 200,
  amplitude: 1,
  fluxThreshold: 0.52,
  minObstacleGapWorld: 120,
})

function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el.isContentEditable
}

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
  const [controls, setControls] = useState<ControlSettings>(() => loadControlSettings())
  const [listeningSlot, setListeningSlot] = useState<GameActionSlot | null>(null)
  const [bindError, setBindError] = useState<string | null>(null)
  const [playHud, setPlayHud] = useState<{
    alive: boolean
    reason: GameSimState['reason']
  }>({ alive: true, reason: 'playing' })

  const [sim] = useState<GameSimState>(() => createSimState())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const showTouchPads = useTouchUi()

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

  /** Al perder, bajar volumen y pausar para que la música no siga en el overlay. */
  useEffect(() => {
    if (!clock || screen !== 'play') return
    if (!playHud.alive && !ended && clock.isPlaying()) {
      void clock.pauseWithFade(480)
    }
  }, [clock, screen, playHud.alive, ended])

  useEffect(() => {
    if (screen !== 'play') return
    const id = globalThis.window.setInterval(
      () => setPlayUiTick((n) => (n + 1) % 1_000_000),
      150,
    )
    return () => globalThis.window.clearInterval(id)
  }, [screen])

  useEffect(() => {
    if (!listeningSlot || screen !== 'options') return
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') {
        setListeningSlot(null)
        setBindError(null)
        return
      }
      const code = e.code
      setControls((prev) => {
        const other = (
          Object.entries(prev.bindings) as [GameActionSlot, string][]
        ).find(([k, v]) => v === code && k !== listeningSlot)?.[0]
        if (other) {
          setBindError(`Esa tecla ya está en ${SLOT_LABEL[other]}. Pulsa Escape para cancelar.`)
          return prev
        }
        setBindError(null)
        const nextBindings = { ...prev.bindings, [listeningSlot]: code }
        const next: ControlSettings = { ...prev, bindings: nextBindings }
        saveControlSettings(next)
        return next
      })
      setListeningSlot(null)
    }
    globalThis.window.addEventListener('keydown', onKey, true)
    return () => globalThis.window.removeEventListener('keydown', onKey, true)
  }, [listeningSlot, screen])

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
    setPlayHud({ alive: true, reason: 'playing' })
    clock.seek(0)
    setScreen('play')
    await clock.play()
  }

  const togglePause = useCallback(async () => {
    if (!clock) return
    if (clock.isPlaying()) await clock.pauseWithFade(380)
    else {
      setEnded(false)
      await clock.play()
    }
  }, [clock])

  const leavePlayToMenu = useCallback(() => {
    if (clock?.isPlaying()) void clock.pauseWithFade(420)
    setScreen('menu')
  }, [clock])

  const retryFromOverlay = async () => {
    if (!clock || !course) return
    setEnded(false)
    resetSim(sim, course)
    setPlayHud({ alive: true, reason: 'playing' })
    clock.seek(0)
    await clock.play()
  }

  const showGameOver = screen === 'play' && (!playHud.alive || ended)

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
            <button type="button" className="btn" onClick={() => setScreen('options')}>
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
          <p className="hint keys">
            Teclas <kbd>H</kbd> <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> (por defecto):{' '}
            <strong>K</strong> salta. Reasignación en Opciones. Pausa: <kbd>P</kbd>.
          </p>
          <p className="hint tutorial">
            Tutorial: cargá una pista, ajustá compensación (ms) si el scroll va desfasado, iniciá
            juego y usá la barra para seek. En móvil/tablet aparecen pads táctiles.
          </p>
        </section>
      )}

      {screen === 'options' && (
        <section className="panel options-panel">
          <h2>Opciones</h2>

          <h3 className="options-sub">Controles (teclado)</h3>
          <p className="hint small">
            {listeningSlot
              ? 'Pulsá una tecla para asignar (Escape cancela).'
              : 'Hacé clic en «Cambiar» junto a una acción.'}
          </p>
          {bindError && <p className="bind-error">{bindError}</p>}
          {(Object.keys(controls.bindings) as GameActionSlot[]).map((slot) => (
            <div key={slot} className="bind-row">
              <span className="bind-label">{SLOT_LABEL[slot]}</span>
              <code className="bind-code">{controls.bindings[slot]}</code>
              <button
                type="button"
                className="btn small"
                disabled={listeningSlot !== null && listeningSlot !== slot}
                onClick={() => {
                  setBindError(null)
                  setListeningSlot(listeningSlot === slot ? null : slot)
                }}
              >
                {listeningSlot === slot ? 'Escuchando…' : 'Cambiar'}
              </button>
            </div>
          ))}
          <div className="menu-row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const d = defaultControlSettings()
                setControls(d)
                saveControlSettings(d)
                setListeningSlot(null)
                setBindError(null)
              }}
            >
              Restaurar teclas H J K L
            </button>
          </div>

          <h3 className="options-sub">Audio y curso</h3>
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
          <label className="field">
            <span>Separación mín. obstáculos (px mundo)</span>
            <input
              type="range"
              min={40}
              max={400}
              value={Math.round(genParams.minObstacleGapWorld)}
              onChange={(e) =>
                setGenParams((p) => ({
                  ...p,
                  minObstacleGapWorld: Number(e.target.value),
                }))
              }
            />
            <output>{Math.round(genParams.minObstacleGapWorld)}</output>
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
            <button type="button" className="btn" onClick={leavePlayToMenu}>
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

          <div className="play-stage">
            <GameCanvas
              clock={clock}
              course={course}
              features={features}
              sim={sim}
              bindings={controls.bindings}
              showTouchPads={showTouchPads}
              onHud={setPlayHud}
            />
            {showGameOver && (
              <div className="game-over-overlay" role="dialog" aria-modal="true">
                <div className="game-over-card">
                  <h2>{ended && playHud.alive ? 'Fin de pista' : 'Partida terminada'}</h2>
                  <p className="game-over-reason">
                    {!playHud.alive && (
                      <>
                        Motivo: <strong>{playHud.reason}</strong>
                      </>
                    )}
                    {ended && playHud.alive && <span>La música llegó al final.</span>}
                  </p>
                  <div className="menu-row">
                    <button type="button" className="btn primary" onClick={() => void retryFromOverlay()}>
                      Reintentar
                    </button>
                    <button type="button" className="btn" onClick={leavePlayToMenu}>
                      Menú
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="hint keys">
            <kbd>H</kbd> <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd>: la ranura <strong>K</strong> es salto
            (reasignable). Barra: seek en buffer. Offset en opciones afecta el tiempo de mundo.
          </p>
        </section>
      )}

      <GlobalKeyHandler enabled={screen === 'play'} onPauseToggle={() => void togglePause()} />
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
      if (isTypingTarget(e.target)) return
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        onPauseToggle()
      }
    }
    globalThis.window.addEventListener('keydown', onKey)
    return () => globalThis.window.removeEventListener('keydown', onKey)
  }, [enabled, onPauseToggle])
  return null
}
