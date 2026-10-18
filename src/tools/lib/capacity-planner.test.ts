import { describe, expect, it } from 'vitest'
import { erlangB, erlangC, little, mmc, mmck, staffFor } from './capacity-planner'

describe('capacity planner', () => {
  it('Erlang B/C closed forms', () => {
    // a = 2, c = 3: B = (8/6)/(1+2+2+8/6) = 4/19, C = 4/9
    expect(erlangB(3, 2)).toBeCloseTo(4 / 19, 12)
    expect(erlangC(3, 2)).toBeCloseTo(4 / 9, 12)
    expect(erlangC(1, 0.6)).toBeCloseTo(0.6, 12) // M/M/1: P(wait) = ρ
    expect(erlangC(2, 2)).toBe(1)
  })
  it('M/M/1 textbook values', () => {
    const r = mmc(2, 3, 1)
    expect(r.rho).toBeCloseTo(2 / 3)
    expect(r.W).toBeCloseTo(1)
    expect(r.L).toBeCloseTo(2)
    expect(r.Lq).toBeCloseTo(4 / 3)
    expect(r.Wq).toBeCloseTo(2 / 3)
    expect(r.L).toBeCloseTo(2 * r.W) // Little
    expect(r.slWithin(1)).toBeCloseTo(1 - (2 / 3) * Math.exp(-1))
    expect(r.waitQuantile(0.9)).toBeCloseTo(Math.log((2 / 3) / 0.1))
  })
  it('M/M/c call-centre example', () => {
    // a = 10 Erlangs, 11 agents: Erlang C ≈ 0.6821
    expect(erlangC(11, 10)).toBeCloseTo(0.6821, 3)
    const r = mmc(10, 1, 12)
    expect(r.Lq).toBeCloseTo(r.Wq * 10)
    expect(r.L).toBeCloseTo(r.Lq + 10)
  })
  it('M/M/1/K matches the geometric closed form', () => {
    const rho = 0.8, K = 5
    const r = mmck(0.8, 1, 1, K)
    const pK = ((1 - rho) * rho ** K) / (1 - rho ** (K + 1))
    expect(r.pBlock).toBeCloseTo(pK, 12)
    const L = rho / (1 - rho) - ((K + 1) * rho ** (K + 1)) / (1 - rho ** (K + 1))
    expect(r.L).toBeCloseTo(L, 10)
    expect(r.throughput).toBeCloseTo(0.8 * (1 - pK))
  })
  it('M/M/c/K tends to M/M/c for a large buffer', () => {
    const a = mmck(8, 1, 10, 400), b = mmc(8, 1, 10)
    expect(a.Wq).toBeCloseTo(b.Wq, 6)
    expect(a.pWait).toBeCloseTo(b.pWait, 6)
    expect(a.slWithin(0.2)).toBeCloseTo(b.slWithin(0.2), 6)
  })
  it('staffing to an 80/20 service level', () => {
    // 100 calls/h... in seconds: λ = 0.05/s, AHT 180 s → 9 Erlangs, 80% answered in 20 s
    const c = staffFor(0.05, 1 / 180, 20, 0.8)
    expect(c).toBeGreaterThanOrEqual(10)
    expect(mmc(0.05, 1 / 180, c).slWithin(20)).toBeGreaterThanOrEqual(0.8)
    expect(mmc(0.05, 1 / 180, c - 1).slWithin(20)).toBeLessThan(0.8)
  })
  it("Little's law solver", () => {
    expect(little(NaN, 5, 2).L).toBe(10)
    expect(little(10, NaN, 2).lambda).toBe(5)
    expect(little(10, 5, NaN).W).toBe(2)
  })
})
