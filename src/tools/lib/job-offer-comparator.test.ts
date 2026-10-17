import { describe, expect, it } from 'vitest'
import { compute, horizonValue, type Offer } from './job-offer-comparator'

const O: Offer = { id: 'a', name: 'A', base: 100000, bonusPct: 10, signing: 20000, equity: 15000, matchPct: 4, benefits: 1000, premium: 200, ptoDays: 15, hoursWeek: 40, officeDays: 3, commuteMin: 30, commuteCost: 10, taxPct: 25, col: 100 }

describe('job offer maths', () => {
  it('computes year-one total comp', () => {
    const b = compute(O, 1, 10)
    expect(b.bonus).toBe(10000)
    expect(b.match).toBe(4000)
    expect(b.totalComp).toBe(100000 + 10000 + 20000 + 15000 + 4000 + 1000)
    // 25 days off = 5 weeks → 47 work weeks; 141 office days
    expect(b.costs).toBe(2400 + 1410)
    expect(b.commuteHours).toBe(141)
    expect(b.afterTax).toBeCloseTo(145000 * 0.75 + 5000 - 3810)
    expect(b.workHours).toBe(1880)
    expect(b.hourly).toBeCloseTo(b.afterTax / (1880 + 141))
  })
  it('amortises signing and adjusts for cost of living', () => {
    expect(compute(O, 4).signing).toBe(5000)
    const exp = compute({ ...O, col: 125 })
    expect(exp.colAdjusted).toBeCloseTo(exp.afterTax * 0.8)
  })
  it('horizon applies raises and one-time signing', () => {
    const flat = horizonValue({ ...O, signing: 0 }, 3, 0)
    expect(flat).toBeCloseTo(compute({ ...O, signing: 0 }).colAdjusted * 3)
    expect(horizonValue(O, 3, 3)).toBeGreaterThan(flat + 20000 * 0.75)
  })
})
