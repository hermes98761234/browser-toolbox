import { describe, expect, it } from 'vitest'
import { compare, sampleSize, srm, wilson } from './a-b-test-calculator'

describe('a/b test statistics', () => {
  it('two-proportion z-test reference values', () => {
    // 200/1000 vs 250/1000: pooled p = .225, se = .018675, z = 2.677, p ≈ 0.0074
    const r = compare(1000, 200, 1000, 250, 0.05, 'two')
    expect(r.z).toBeCloseTo(2.677, 2)
    expect(r.p).toBeCloseTo(0.0074, 3)
    expect(r.significant).toBe(true)
    expect(r.lift).toBeCloseTo(0.25)
    expect(r.diffCI[0]).toBeCloseTo(0.05 - 1.95996 * Math.sqrt(0.16 / 1000 + 0.1875 / 1000), 4)
    expect(r.probBBeats).toBeGreaterThan(0.99)
    const one = compare(1000, 200, 1000, 250, 0.05, 'one')
    expect(one.p).toBeCloseTo(r.p / 2, 5)
  })
  it('wilson interval', () => {
    const [lo, hi] = wilson(20, 100, 0.95)
    expect(lo).toBeCloseTo(0.1334, 3)
    expect(hi).toBeCloseTo(0.2888, 3)
  })
  it('sample size matches the standard formula', () => {
    // 10% → 12% (20% relative), alpha .05 two-sided, power .8 → 3841 per group
    expect(sampleSize(0.1, 0.2, 0.05, 0.8, 'two')).toBe(3841)
    expect(sampleSize(0.1, 0, 0.05, 0.8, 'two')).toBeNaN()
  })
  it('SRM detects a skewed split', () => {
    expect(srm([5000, 5000]).p).toBeCloseTo(1)
    expect(srm([5000, 5400]).p).toBeLessThan(0.001)
  })
})
