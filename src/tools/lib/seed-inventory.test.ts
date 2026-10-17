import { describe, expect, it } from 'vitest'
import { germination, seedsNeeded, spotsNeeded, status, testRate } from './seed-inventory'

describe('seed inventory', () => {
  it('decays germination', () => {
    expect(germination(0.9, 0, 4)).toBe(0.9)
    expect(germination(0.8, 4, 4)).toBeCloseTo(0.4)
    expect(germination(0.8, 2, 4)).toBeCloseTo(0.8 / Math.SQRT2)
  })
  it('status', () => {
    expect(status(0, 3, 0.8)).toBe('fresh')
    expect(status(2, 4, 0.7)).toBe('good')
    expect(status(3, 3, 0.5)).toBe('aging')
    expect(status(5, 3, 0.5)).toBe('replace')
    expect(status(1, 3, 0.3)).toBe('replace')
  })
  it('sowing quantities', () => {
    expect(seedsNeeded(20, 0.8, 0)).toBe(25)
    expect(seedsNeeded(20, 0.8, 0.2)).toBe(32)
    // 2 per cell at 50%: P(spot ok) = 0.75 → 27 spots → 54 seeds
    expect(seedsNeeded(20, 0.5, 0, 2)).toBe(54)
    expect(spotsNeeded(20, 0.5, 0, 2)).toBe(27)
    expect(testRate(20, 17)).toBeCloseTo(0.85)
  })
})
