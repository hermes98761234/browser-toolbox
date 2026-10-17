import { describe, expect, it } from 'vitest'
import { KGHA_TO_LBAC, seedRate } from './seed-rate-calculator'

describe('seed-rate', () => {
  it('wheat example', () => {
    const r = seedRate({ plants: 250, tsw: 45, germ: 95, purity: 100, survival: 85, area: 12, bag: 25, margin: 0, row: 15 })
    expect(r.seedsM2).toBeCloseTo(309.6, 1)
    expect(r.kgHa).toBeCloseTo(139.32, 2)
    expect(r.totalKg).toBeCloseTo(1671.8, 1)
    expect(r.bags).toBe(67)
    expect(r.seedsPerM).toBeCloseTo(46.4, 1)
  })
  it('exact bag counts are not rounded up', () => {
    const r = seedRate({ plants: 100, tsw: 50, germ: 100, purity: 100, survival: 100, area: 2, bag: 25, margin: 0, row: 0 })
    expect(r.kgHa).toBe(50)
    expect(r.bags).toBe(4)
    expect(r.spacingCm).toBe(0)
  })
  it('unit factor', () => {
    expect(100 * KGHA_TO_LBAC).toBeCloseTo(89.22, 2)
  })
})
