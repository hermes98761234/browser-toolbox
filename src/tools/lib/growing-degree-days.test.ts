import { describe, expect, it } from 'vitest'
import { accumulate, cToF, fToC, gddAverage, gddModified, gddSine, reachedAt } from './growing-degree-days'

describe('growing-degree-days', () => {
  it('average and modified methods', () => {
    expect(gddAverage(10, 30, 10)).toBe(10)
    expect(gddAverage(0, 8, 10)).toBe(0)
    // corn: 95/60 °F → Tmax capped 86 → (86+60)/2 − 50 = 23
    expect(gddModified(60, 95, 50, 86)).toBe(23)
    // Tmin below base raised to base: (80+50)/2 − 50 = 15
    expect(gddModified(40, 80, 50, 86)).toBe(15)
  })
  it('single sine method', () => {
    expect(gddSine(15, 25, 10)).toBeCloseTo(10, 10) // fully above base = mean − base
    expect(gddSine(0, 8, 10)).toBe(0)
    expect(gddSine(32, 35, 10, 30)).toBe(20)
    // symmetric case Tmin = 0, Tmax = 20, base = 10: area of positive half-wave = a/π = 10/π
    expect(gddSine(0, 20, 10)).toBeCloseTo(10 / Math.PI, 10)
    // cutoff reduces heat units, and sine ≥ average when Tmin < base
    expect(gddSine(15, 40, 10, 30)).toBeLessThan(gddSine(15, 40, 10))
    expect(gddSine(5, 25, 10)).toBeGreaterThan(gddAverage(5, 25, 10))
  })
  it('units and accumulation', () => {
    expect(cToF(10)).toBe(50)
    expect(fToC(86)).toBe(30)
    const c = accumulate([1, 2, 3])
    expect(c).toEqual([1, 3, 6])
    expect(reachedAt(c, 3)).toBe(1)
    expect(reachedAt(c, 7)).toBe(-1)
  })
})
