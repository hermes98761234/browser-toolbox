import { describe, expect, it } from 'vitest'
import { ageDays, bmi, lms, normCdf, normInv, valueAt, zScore } from './growth-percentile-chart'

describe('growth-percentile-chart', () => {
  it('returns WHO LMS values at table points', () => {
    expect(lms('wfa', 'm', 0)).toEqual([0.3487, 3.3464, 0.14602])
    expect(lms('lhfa', 'f', 0)?.[1]).toBeCloseTo(49.1477, 4)
    expect(lms('wfa', 'm', 1826)?.[1]).toBeCloseTo(18.3, 0)
    expect(lms('wfa', 'm', 3000)).toBeNull()
  })
  it('switches from length to height at 24 months', () => {
    const before = lms('lhfa', 'm', 730)![1], after = lms('lhfa', 'm', 731)![1]
    expect(before - after).toBeCloseTo(0.67, 1)
  })
  it('reproduces WHO SD curves', () => {
    // boys birth weight: −2 SD ≈ 2.5 kg (2.46), +2 SD ≈ 4.4 kg
    expect(valueAt(lms('wfa', 'm', 0)!, -2)).toBeCloseTo(2.46, 2)
    expect(valueAt(lms('wfa', 'm', 0)!, 2)).toBeCloseTo(4.4, 1)
    expect(zScore('wfa', 3.3464, lms('wfa', 'm', 0)!)).toBeCloseTo(0, 9)
  })
  it('applies the restricted z beyond +3 SD for weight', () => {
    const p = lms('wfa', 'm', 365)!
    const sd3 = valueAt(p, 3), sd2 = valueAt(p, 2)
    expect(zScore('wfa', sd3 + (sd3 - sd2), p)).toBeCloseTo(4, 9)
  })
  it('converts z to percentiles and back', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7)
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 6)
    expect(normInv(0.97)).toBeCloseTo(1.880794, 5)
    expect(normInv(0.03)).toBeCloseTo(-1.880794, 5)
    expect(normInv(0.5)).toBeCloseTo(0, 9)
  })
  it('computes age and BMI', () => {
    expect(ageDays('2024-01-01', '2024-12-31')).toBe(365)
    expect(bmi(10, 75)).toBeCloseTo(17.78, 2)
  })
})
