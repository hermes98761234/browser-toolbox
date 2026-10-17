import { describe, expect, it } from 'vitest'
import { costPerKgNutrient, delivered, gramsPerLitre, parseLabel, productGrams, ratio, RATE_UNITS } from './fertilizer-npk-calculator'

describe('fertilizer-npk-calculator', () => {
  it('converts rate units', () => {
    expect(RATE_UNITS['lb/1000ft2']).toBeCloseTo(4.8824, 3)
    expect(RATE_UNITS['lb/1000ft2'] / RATE_UNITS['kg/ha']).toBeCloseTo(48.82, 1)
    expect(RATE_UNITS['lb/acre'] / RATE_UNITS['kg/ha']).toBeCloseTo(1.1209, 3)
  })
  it('1 lb N per 1000 ft² from 25-0-5 needs 4 lb of product', () => {
    const g = productGrams(1, 'lb/1000ft2', 5000, 'ft2', 25)
    expect(g / 453.59237).toBeCloseTo(20, 6) // 5 × 4 lb
  })
  it('kg/ha target', () => {
    // 100 kg N/ha on 0.5 ha with urea 46-0-0 → 108.7 kg
    expect(productGrams(100, 'kg/ha', 0.5, 'ha', 46) / 1000).toBeCloseTo(108.7, 1)
    expect(productGrams(1, 'kg/ha', 1, 'ha', 0)).toBe(Infinity)
  })
  it('round-trips delivered nutrients', () => {
    const p = { id: 'a', name: 'x', n: 10, p: 20, k: 10, bag: 20, price: 30 }
    const g = productGrams(2, 'g/m2', 50, 'm2', 10)
    const d = delivered(p, g, 'g/m2', 50, 'm2')
    expect(d.n).toBeCloseTo(2)
    expect(d.p).toBeCloseTo(4)
  })
  it('cost and mixing', () => {
    expect(costPerKgNutrient({ id: 'u', name: 'Urea', n: 46, p: 0, k: 0, bag: 25, price: 23 }, 'n')).toBeCloseTo(2)
    expect(gramsPerLitre(200, 20)).toBeCloseTo(1)
  })
  it('ratios and labels', () => {
    expect(ratio({ n: 24, p: 8, k: 16 })).toBe('3 : 1 : 2')
    expect(ratio({ n: 46, p: 0, k: 0 })).toBe('1 : 0 : 0')
    expect(parseLabel('10-10-10')).toEqual([10, 10, 10])
    expect(parseLabel('24 8 16')).toEqual([24, 8, 16])
    expect(parseLabel('60-60-60')).toBeNull()
  })
})
