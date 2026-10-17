import { describe, expect, it } from 'vitest'
import { katch, mifflin, split, weeklyDelta } from './macro-calculator'

describe('macro calculator', () => {
  it('Mifflin-St Jeor reference values', () => {
    expect(mifflin('male', 80, 180, 30)).toBe(1780)
    expect(mifflin('female', 60, 165, 30)).toBeCloseTo(1320.25)
  })
  it('Katch-McArdle', () => {
    expect(katch(80, 20)).toBeCloseTo(370 + 21.6 * 64)
  })
  it('macro split adds back to the calories', () => {
    const m = split(2000, 30, 25)
    expect(m.protein).toBeCloseTo(150)
    expect(m.fat).toBeCloseTo(55.56, 1)
    expect(m.carbs).toBeCloseTo(225)
    expect(m.protein * 4 + m.carbs * 4 + m.fat * 9).toBeCloseTo(2000)
  })
  it('0.5 kg/week is 550 kcal/day', () => {
    expect(weeklyDelta(-0.5)).toBeCloseTo(-550)
  })
})
