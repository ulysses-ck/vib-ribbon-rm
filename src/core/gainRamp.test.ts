import { describe, expect, it } from 'vitest'
import { fadeScheduleEndDelayMs } from './gainRamp'

describe('fadeScheduleEndDelayMs', () => {
  it('ceil duration plus cushion', () => {
    expect(fadeScheduleEndDelayMs(380)).toBe(380 + 35)
    expect(fadeScheduleEndDelayMs(380.2)).toBe(381 + 35)
  })

  it('respects custom cushion', () => {
    expect(fadeScheduleEndDelayMs(100, 10)).toBe(110)
  })
})
