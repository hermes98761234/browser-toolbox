import { describe, expect, it } from 'vitest'
import { breakEven, curves } from './break-even-calculator'

describe('breakEven', () => {
  const r = breakEven({ fixed: 10000, price: 50, variable: 30, expected: 800, target: 4000 })
  it('textbook values', () => {
    expect(r.cm).toBe(20)
    expect(r.cmRatio).toBeCloseTo(0.4)
    expect(r.units).toBe(500)
    expect(r.unitsCeil).toBe(500)
    expect(r.revenue).toBe(25000)
    expect(r.targetUnits).toBe(700)
    expect(r.profit).toBe(6000)
    expect(r.safety).toBe(300)
    expect(r.safetyPct).toBeCloseTo(0.375)
    expect(r.dol).toBeCloseTo(16000 / 6000)
  })
  it('rounds fractional units up and flags impossible cases', () => {
    expect(breakEven({ fixed: 100, price: 7, variable: 4, expected: 0, target: 0 }).unitsCeil).toBe(34)
    expect(breakEven({ fixed: 100, price: 4, variable: 5, expected: 10, target: 0 }).units).toBe(Infinity)
  })
  it('curves cross at break-even', () => {
    const c = curves({ fixed: 10000, price: 50, variable: 30, expected: 0, target: 0 }, 1000, 10)
    expect(c.revenue[5]).toEqual([500, 25000])
    expect(c.cost[5]).toEqual([500, 25000])
    expect(c.profit[5][1]).toBe(0)
  })
})
