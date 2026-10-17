import { describe, expect, it } from 'vitest'
import { factorOf, idealWeight, portions, quarters, rer } from './cat-food-calculator'

describe('cat food calculator', () => {
  it('RER reference: 4 kg cat ≈ 198 kcal', () => {
    expect(rer(4)).toBeCloseTo(197.99, 1)
    expect(rer(1)).toBe(70)
  })
  it('neutered adult factor 1.2', () => {
    expect(rer(4) * factorOf('neutered')).toBeCloseTo(237.6, 0)
  })
  it('ideal weight from BCS 7 (≈20% over)', () => {
    expect(idealWeight(6, 7)).toBeCloseTo(5)
    expect(idealWeight(4, 5)).toBe(4)
  })
  it('splits wet/dry portions', () => {
    const p = portions(240, 0.5, 90, 85, 3800, 400)
    expect(p.wetKcal).toBe(120)
    expect(p.wetGrams).toBeCloseTo(133.33, 1)
    expect(p.cans).toBeCloseTo(1.569, 2)
    expect(p.dryGrams).toBeCloseTo(31.58, 1)
    expect(p.cups).toBeCloseTo(0.3)
  })
  it('quarters', () => {
    expect(quarters(1.27)).toBe('1 ¼')
    expect(quarters(0.5)).toBe('½')
    expect(quarters(2)).toBe('2')
    expect(quarters(0.05)).toBe('< ¼')
  })
})
