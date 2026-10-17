import { describe, expect, it } from 'vitest'
import { normCdf, normInv, power, precisionN, sampleSize, tCdf, tInv, type Inputs } from './sample-size-calculator'

const base: Inputs = { design: 'two-means', alpha: 0.05, power: 0.8, sides: 2, ratio: 1, diff: 0.5, sd: 1, tAdjust: false, p1: 0.5, p2: 0.6 }

describe('sample size calculator', () => {
  it('has accurate distributions', () => {
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5)
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 6)
    expect(tCdf(2.228139, 10)).toBeCloseTo(0.975, 5)
    expect(tInv(0.975, 10)).toBeCloseTo(2.228139, 4)
    expect(tInv(0.95, 3)).toBeCloseTo(2.353363, 4)
  })
  it('matches textbook sample sizes for means', () => {
    expect(sampleSize(base).n1).toBeCloseTo(62.79, 1) // z-approximation
    expect(Math.ceil(sampleSize({ ...base, tAdjust: true }).n1)).toBe(64) // G*Power: 64 per group
    expect(Math.ceil(sampleSize({ ...base, design: 'one-mean', tAdjust: true }).n1)).toBe(34) // G*Power one-sample d=0.5: 34
  })
  it('matches textbook sample sizes for proportions', () => {
    // Fleiss formula without continuity correction: p1=.5 p2=.6 → 387.3 → 388 per group
    expect(Math.ceil(sampleSize({ ...base, design: 'two-props' }).n1)).toBe(388)
    expect(Math.ceil(sampleSize({ ...base, design: 'one-prop', p1: 0.5, p2: 0.6 }).n1)).toBe(194)
  })
  it('power at the required n equals the target', () => {
    const n = sampleSize(base).n1
    expect(power(base, n)).toBeCloseTo(0.8, 2)
    const pp = { ...base, design: 'two-props' as const }
    expect(power(pp, sampleSize(pp).n1)).toBeCloseTo(0.8, 2)
  })
  it('computes precision-based n', () => {
    expect(Math.ceil(precisionN(0.95, 0.05, { p: 0.5 }))).toBe(385)
    expect(Math.ceil(precisionN(0.95, 0.05, { p: 0.5, N: 1000 }))).toBe(278)
  })
})
