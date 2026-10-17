import { describe, expect, it } from 'vitest'
import { breathsPerMinute, cycleLength, fullness, phaseAt, phases } from './breathing-exercise-guide'

describe('breathing-exercise-guide', () => {
  it('drops zero-length phases', () => {
    expect(phases([4, 7, 8, 0]).map((p) => p.kind)).toEqual(['in', 'hold', 'out'])
    expect(cycleLength([4, 7, 8, 0])).toBe(19)
    expect(breathsPerMinute([4, 4, 4, 4])).toBe(3.75)
  })
  it('finds the active phase', () => {
    const s = phaseAt([4, 4, 4, 4], 9.5)!
    expect(s.phase.kind).toBe('out')
    expect(s.into).toBeCloseTo(1.5)
    expect(s.remaining).toBeCloseTo(2.5)
    expect(s.cycle).toBe(0)
    const s2 = phaseAt([4, 7, 8, 0], 19 * 3 + 5)!
    expect(s2.cycle).toBe(3)
    expect(s2.phase.kind).toBe('hold')
  })
  it('animates fullness smoothly', () => {
    expect(fullness(phaseAt([4, 0, 4, 0], 0)!)).toBeCloseTo(0)
    expect(fullness(phaseAt([4, 0, 4, 0], 2)!)).toBeCloseTo(0.5)
    expect(fullness(phaseAt([4, 0, 4, 0], 6)!)).toBeCloseTo(0.5)
    expect(phaseAt([0, 0, 0, 0], 3)).toBeNull()
  })
})
