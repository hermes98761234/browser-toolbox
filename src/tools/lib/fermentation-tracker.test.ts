import { describe, expect, it } from 'vitest'
import { addDays, brineSalt, daysBetween, drySalt, phase, readyWindow, saltAdvice } from './fermentation-tracker'

describe('fermentation maths', () => {
  it('dry salt is a percentage of vegetable weight', () => {
    expect(drySalt(1000, 2)).toBe(20)
    expect(drySalt(2500, 2.5)).toBeCloseTo(62.5)
  })
  it('brine salt as percentage of brine and as equilibrium', () => {
    expect(brineSalt(1000, 3.5)).toBeCloseTo(36.27, 2)
    // check: 36.27 / (1000 + 36.27) = 3.5 %
    const s = brineSalt(1000, 5)
    expect(s / (1000 + s)).toBeCloseTo(0.05, 10)
    expect(brineSalt(600, 2, 'equilibrium', 900)).toBeCloseTo(30)
    expect(brineSalt(1000, 0)).toBe(0)
  })
  it('scales the ready window with temperature (Q10 = 2)', () => {
    expect(readyWindow([21, 42], 20)).toEqual([21, 42])
    expect(readyWindow([21, 42], 10)).toEqual([42, 84])
    expect(readyWindow([10, 20], 30)).toEqual([5, 10])
    expect(readyWindow([10, 20], 40)).toEqual(readyWindow([10, 20], 32))
  })
  it('dates and phases', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59)
    expect(phase(3, [5, 10], false)).toBe('early')
    expect(phase(7, [5, 10], false)).toBe('ready')
    expect(phase(11, [5, 10], false)).toBe('over')
    expect(phase(11, [5, 10], true)).toBe('done')
  })
  it('salt advice', () => {
    expect(saltAdvice('dry', 1).tone).toBe('err')
    expect(saltAdvice('dry', 2).tone).toBe('ok')
    expect(saltAdvice('brine', 8).tone).toBe('warn')
  })
})
