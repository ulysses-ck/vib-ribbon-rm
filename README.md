# Vib-Ribbon RM

Remake web **experimental**: audio local → features offline → curso procedural → plataforma con scroll ligado al tiempo de reproducción. Inspirado en *Vib-Ribbon*; no es una copia oficial.

## Stack

React 19 · Vite 8 · TypeScript · Canvas 2D · Web Audio (`AudioBuffer` + `AnalyserNode`) · Vitest

## Cómo correr

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # tests del núcleo
pnpm run build
```

## Qué hay hoy

| Área | Rol |
|------|-----|
| `src/core/audioClock.ts` | Reloj de juego, volumen, fundido al pausar, `getSimWorldTime()` con pausa congelada |
| `src/audio/` | Decodificación + `FeatureTrack` (RMS, flux, bandas, onsets) |
| `src/gen/courseGenerator.ts` | Curso determinista (semilla + parámetros) |
| `src/game/sim.ts` | Física básica, pinchos/pozos, ribbon H/J/K/L |
| `src/render/GameCanvas.tsx` | Loop `rAF`, FFT en vivo, debug offline, DPR |
| `src/input/` | Teclas H J K L reconfigurables + táctil en mobile/tablet |
| `src/App.tsx` | Menú, opciones, partida, overlay fin/reintento |

## Roadmap (hacer el juego)

- [ ] **Preview de curso**: seek + dibujo del nivel sin avanzar sim / sin depender del play en vivo
- [ ] **Ritmo**: beat / BPM u onsets más musicales; opción de alinear obstáculos al compás
- [ ] **Ribbon real**: deformaciones y reglas más cercanas al original; feedback visual fuerte
- [ ] **Puntuación y estados**: combo, fallos, reinicio rápido, tabla local
- [ ] **Contenido**: tutorial in-game, pista demo en `public/` (opcional)
- [ ] **Pulido**: pausa con overlay; opciones de accesibilidad (contraste, velocidad, input)
- [ ] **Empaquetado**: PWA o build para itch.io; notas sobre música provista por el usuario

---

*Proyecto educativo / fan; derechos de marca y música son responsabilidad de quien publique.*
