import { describe, expect, it } from 'vitest'
import { atMoisture, pointFactor, shrink, waterShrink } from './grain-moisture-shrink-calculator'

describe('grain-moisture-shrink-calculator', () => {
  it('water shrink matches the textbook 25% → 15.5% corn example', () => {
    expect(waterShrink(25, 15.5)).toBeCloseTo(9.5 / 84.5, 10) // 11.24%
    expect(pointFactor(15.5)).toBeCloseTo(1.1834, 4)
    expect(waterShrink(14, 15.5)).toBe(0)
    expect(waterShrink(100, 10)).toBeNaN()
  })
  it('conserves dry matter', () => {
    const w = 100000
    const r = shrink({ wetWeight: w, m0: 22, m1: 15, handling: 0, method: 'exact', factor: 0 })
    expect(r.dryWeight).toBeCloseTo(atMoisture(w, 22, 15), 6)
    expect(r.dryWeight * 0.85).toBeCloseTo(w * 0.78, 6)
  })
  it('applies elevator factor and handling loss', () => {
    const r = shrink({ wetWeight: 56000, m0: 20, m1: 15, handling: 0.5, method: 'factor', factor: 1.4 })
    expect(r.points).toBe(5)
    expect(r.total).toBeCloseTo(0.075, 10)
    expect(r.dryWeight).toBeCloseTo(51800, 6)
    expect(shrink({ wetWeight: 1, m0: 12, m1: 15, handling: 0.5, method: 'exact', factor: 0 }).total).toBe(0)
  })
})
