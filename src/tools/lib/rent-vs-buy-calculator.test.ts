import { describe, expect, it } from 'vitest'
import { payment, simulate, type Inputs } from './rent-vs-buy-calculator'

const base: Inputs = { price: 400000, downPct: 20, rate: 6.5, term: 30, closingPct: 3, sellPct: 6, taxPct: 1.1, insurance: 1800, maintPct: 1, hoa: 0, appreciation: 3.5, rent: 2200, rentGrowth: 3.5, rentersIns: 200, invest: 6, inflation: 2.5, years: 30, pmiPct: 0.5, deductPct: 0 }

describe('rent-vs-buy-calculator', () => {
  it('amortizes like a bank', () => {
    expect(payment(320000, 6.5, 30)).toBeCloseTo(2022.62, 2)
    expect(payment(120000, 0, 10)).toBe(1000)
    const r = simulate(base)
    expect(r.rows[29].balance).toBeCloseTo(0, 0)
    expect(r.upfront).toBe(92000)
    expect(r.rows[0].homeValue).toBeCloseTo(400000 * 1.035, 0)
  })
  it('treats both paths with equal money', () => {
    // with zero growth everywhere and identical monthly costs, nobody invests extra
    const flat = simulate({ ...base, price: 100000, downPct: 100, closingPct: 0, sellPct: 0, taxPct: 0, insurance: 0, maintPct: 0, appreciation: 0, rent: 0, rentGrowth: 0, rentersIns: 0, invest: 0, years: 5 })
    expect(flat.rows[4].buyNW).toBeCloseTo(100000)
    expect(flat.rows[4].rentNW).toBeCloseTo(100000)
  })
  it('finds a break-even when owning wins long-term', () => {
    const r = simulate(base)
    expect(r.breakEven).not.toBeNull()
    expect(r.breakEven!).toBeGreaterThan(1)
    const cheapRent = simulate({ ...base, rent: 1200, invest: 9 })
    expect(cheapRent.rows[9].rentNW).toBeGreaterThan(cheapRent.rows[9].buyNW)
  })
})
