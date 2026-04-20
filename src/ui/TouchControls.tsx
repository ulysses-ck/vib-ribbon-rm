import type { GameActionSlot } from '../input/frameInput'

const SLOTS: GameActionSlot[] = ['pressH', 'pressJ', 'pressK', 'pressL']
const LABELS: Record<GameActionSlot, string> = {
  pressH: 'H',
  pressJ: 'J',
  pressK: 'K',
  pressL: 'L',
}

export interface TouchControlsProps {
  visible: boolean
  onSlot: (slot: GameActionSlot) => void
}

/**
 * Four large pads for tablet/phone; hidden on desktop via parent `visible`.
 */
export function TouchControls({ visible, onSlot }: TouchControlsProps) {
  if (!visible) return null

  return (
    <div className="touch-controls" aria-label="Controles táctiles">
      {SLOTS.map((slot) => (
        <button
          key={slot}
          type="button"
          className="touch-pad"
          aria-label={`Acción ${LABELS[slot]}`}
          onPointerDown={(e) => {
            e.preventDefault()
            onSlot(slot)
          }}
        >
          {LABELS[slot]}
        </button>
      ))}
    </div>
  )
}
