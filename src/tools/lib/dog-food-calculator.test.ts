import { describe, expect, it } from 'vitest'
import { idealFromBcs, plan, rer, weeksToTarget } from './dog-food-calculator'

describe('dog-food-calculator', () => {
  it('computes RER', () => {
    expect(rer(10)).toBeCloseTo(393.6, 1) // 70 × 10^0.75
    expect(rer(1)).toBe(70)
    expect(rer(0)).toBe(0)
  })
  it('splits calories into portions', () => {
    const p = plan(1000, { treatPct: 10, wetPct: 0, kcalPerKg: 3600, kcalPerCup: 360, kcalPerCan: 400, meals: 2 })
    expect(p.treats).toBe(100)
    expect(p.dryGrams).toBeCloseTo(250, 6)
    expect(p.dryCups).toBeCloseTo(2.5, 6)
    expect(p.perMeal.grams).toBeCloseTo(125, 6)
    const mixed = plan(1000, { treatPct: 0, wetPct: 25, kcalPerKg: 4000, kcalPerCup: 400, kcalPerCan: 250, meals: 2 })
    expect(mixed.wetUnits).toBe(1)
    expect(mixed.dryGrams).toBeCloseTo(187.5, 6)
  })
  it('estimates ideal weight from body condition', () => {
    expect(idealFromBcs(33, 7)).toBeCloseTo(27.5, 6)
    expect(idealFromBcs(20, 5)).toBe(20)
  })
  it('estimates weight-loss duration', () => {
    expect(weeksToTarget(30, 27, 1)).toBe(11) // ln(0.9)/ln(0.99) = 10.48
    expect(weeksToTarget(20, 22, 1)).toBe(0)
  })
})
