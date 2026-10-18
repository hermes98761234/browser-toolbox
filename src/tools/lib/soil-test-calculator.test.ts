import { describe, expect, it } from 'vitest'
import { areaToAcres, CROPS, K_PRODUCTS, limeProduct, N_PRODUCTS, NUTRIENTS, nutrientPlan, P_PRODUCTS, rate, smpLime, sulfurNeed, textureLime } from './soil-test-calculator'

describe('soil test calculator', () => {
  it('rates nutrients by bounds', () => {
    const p = NUTRIENTS[0]
    expect(rate(p, 5)).toBe('Very low')
    expect(rate(p, 15)).toBe('Low')
    expect(rate(p, 25)).toBe('Medium')
    expect(rate(p, 40)).toBe('Optimum')
    expect(rate(p, 80)).toBe('High')
  })
  it('SMP lime matches the classic table to pH 6.8', () => {
    expect(smpLime(6.8, 6.8)).toBeCloseTo(1.4, 5)
    expect(smpLime(6.0, 6.8)).toBeCloseTo(9.72, 1) // table ≈ 9.6
    expect(smpLime(5.0, 6.8)).toBeCloseTo(20.1, 1) // table ≈ 20.0
    expect(smpLime(6.0, 6.0)).toBeLessThan(smpLime(6.0, 6.4))
    expect(smpLime(7.1, 6.8)).toBe(0)
  })
  it('texture lime and sulfur', () => {
    expect(textureLime(5.5, 6.5, 'loam', 2)).toBeCloseTo(2.3, 5)
    expect(textureLime(6.8, 6.5, 'loam', 2)).toBe(0)
    expect(textureLime(5.5, 6.5, 'loam', 4.5)).toBeCloseTo(2.3 * 1.2, 5)
    expect(sulfurNeed(6.5, 4.8, 'sand')).toBeCloseTo(17, 5)
    expect(sulfurNeed(5, 6, 'sand')).toBe(0)
  })
  it('adjusts lime for CCE and depth', () => {
    expect(limeProduct(2, 90, 7)).toBeCloseTo(2.2222, 3)
    expect(limeProduct(2, 100, 3.5)).toBeCloseTo(1, 5)
  })
  it('builds a nutrient plan with N credit from MAP', () => {
    const veg = CROPS.find((c) => c.id === 'veg')!
    const plan = nutrientPlan(veg, 'Low', 'Optimum', 3, P_PRODUCTS[1], K_PRODUCTS[0], N_PRODUCTS[0])
    expect(plan.p2o5).toBe(120)
    expect(plan.k2o).toBe(60)
    expect(plan.pProd).toBeCloseTo(230.77, 1)
    expect(plan.nFromP).toBeCloseTo(25.38, 1)
    expect(plan.nProd).toBeCloseTo(((120 - 25.385) * 100) / 46, 0)
    expect(plan.kProd).toBe(100)
  })
  it('converts areas', () => {
    expect(areaToAcres(43560, 'ft2')).toBeCloseTo(1, 6)
    expect(areaToAcres(1, 'ha')).toBeCloseTo(2.47105, 4)
  })
})
