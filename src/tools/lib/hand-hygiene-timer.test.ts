import { describe, expect, it } from 'vitest'
import { mmss, RANGE, schedule, stepAt, STEPS } from './hand-hygiene-timer'

describe('hand hygiene schedule', () => {
  it('fills the WHO duration exactly', () => {
    for (const m of ['wash', 'rub'] as const) {
      const sl = schedule(STEPS[m], RANGE[m][2])
      const last = sl[sl.length - 1]
      expect(last.start + last.dur).toBeCloseTo(RANGE[m][2])
    }
  })
  it('finds the active step', () => {
    const sl = schedule(STEPS.rub, 25)
    expect(stepAt(sl, 0)).toBe(0)
    expect(stepAt(sl, sl[3].start + 0.01)).toBe(3)
    expect(stepAt(sl, 25)).toBe(STEPS.rub.length)
  })
  it('formats countdowns', () => {
    expect(mmss(59.2)).toBe('1:00')
    expect(mmss(7)).toBe('0:07')
    expect(mmss(-1)).toBe('0:00')
  })
})
