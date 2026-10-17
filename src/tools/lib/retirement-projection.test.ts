import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN, futureValue, realReturn, simulate, surface, sustainableSpending } from './retirement-projection'

const det = { ...DEFAULT_PLAN, volatility: 0 }

describe('retirement projection', () => {
  it('real return removes inflation and fees', () => {
    expect(realReturn({ meanReturn: 7, inflation: 2.5, fees: 0.5 })).toBeCloseTo(1.065 / 1.025 - 1, 12)
  })
  it('zero volatility matches the closed form', () => {
    const s = simulate(det, 3)
    const r = realReturn(det)
    const fv = futureValue(det.balance, det.contribution, r, det.contribGrowth / 100, 30)
    expect(s.atRetirement).toBeCloseTo(fv, 4)
    expect(s.pct.p5[30]).toBeCloseTo(s.pct.p95[30], 6)
    expect(s.ages[0]).toBe(35)
    expect(s.ages.at(-1)).toBe(95)
  })
  it('sustainable spending exhausts the balance exactly at the end', () => {
    const B = 1_000_000, r = 0.03, n = 30
    const w = sustainableSpending(B, r, n)
    const plan = { ...det, age: 65, retireAge: 65, endAge: 95, balance: B, otherIncome: 0, meanReturn: (1.03 * (1 + det.inflation / 100) - 1) * 100 + det.fees }
    expect(realReturn(plan)).toBeCloseTo(0.03, 10)
    expect(simulate({ ...plan, spending: w * 0.999 }, 2).success).toBe(1)
    expect(simulate({ ...plan, spending: w * 1.01 }, 2).success).toBe(0)
    expect(sustainableSpending(300, 0, 3)).toBe(100)
  })
  it('percentiles are ordered and success is a probability', () => {
    const s = simulate(DEFAULT_PLAN, 1500, 9)
    for (let i = 0; i < s.ages.length; i++) {
      expect(s.pct.p5[i]).toBeLessThanOrEqual(s.pct.p50[i])
      expect(s.pct.p50[i]).toBeLessThanOrEqual(s.pct.p95[i])
    }
    expect(s.success).toBeGreaterThan(0)
    expect(s.success).toBeLessThanOrEqual(1)
    expect(s.depletion.reduce((a, b) => a + b, 0)).toBe(Math.round((1 - s.success) * 1500))
    expect(simulate(DEFAULT_PLAN, 300, 4)).toEqual(simulate(DEFAULT_PLAN, 300, 4))
  })
  it('higher returns raise the median surface', () => {
    const rows = surface(DEFAULT_PLAN, [3, 6, 9], 300)
    expect(rows[0].p50[30]).toBeLessThan(rows[1].p50[30])
    expect(rows[1].p50[30]).toBeLessThan(rows[2].p50[30])
    expect(rows[0].success).toBeLessThanOrEqual(rows[2].success)
  })
})
