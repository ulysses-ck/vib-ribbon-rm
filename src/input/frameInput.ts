/** One frame of digital actions (Vib-Ribbon style four slots). */
export interface FrameInput {
  pressH: boolean
  pressJ: boolean
  pressK: boolean
  pressL: boolean
}

export function emptyFrameInput(): FrameInput {
  return {
    pressH: false,
    pressJ: false,
    pressK: false,
    pressL: false,
  }
}

export type GameActionSlot = keyof FrameInput
