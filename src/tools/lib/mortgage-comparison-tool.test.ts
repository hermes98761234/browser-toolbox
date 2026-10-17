import { describe, expect, it } from 'vitest'
import { amortize, apr, breakEven, payment, summarize, type Offer } from './mortgage-comparison-tool'

const base: Offer = { name: 'A', principal: 300000, rate: 6, years: 30, fees: 0, armYears: 0, armRate: 0, extra: 0 }

describe('mortgage-comparison-tool', () => {
  it('annuity payment reference values', () => {
    expect(payment(300000, 0.06 / 12, 360)).toBeCloseTo(1798.65, 2)
    expect(payment(200000, 0.045 / 12, 180)).toBeCloseTo(1529.99, 2)
    expect(payment(1200, 0, 12)).toBe(100)
  })
  it('amortization pays off exactly', () => {
    const rows = amortize(base)
    expect(rows).toHaveLength(360)
    expect(rows[359].balance).toBe(0)
    expect(rows[0].interest).toBeCloseTo(1500, 6)
    expect(summarize(base, rows).interest).toBeCloseTo(347514.57, 0)
  })
  it('extra payments shorten the loan', () => {
    expect(amortize({ ...base, extra: 200 }).length).toBeLessThan(300)
  })
  it('APR equals the note rate without fees and rises with fees', () => {
    expect(apr(base)).toBeCloseTo(6, 6)
    const a = apr({ ...base, fees: 6000 })
    expect(a).toBeGreaterThan(6.15)
    expect(a).toBeLessThan(6.25)
  })
  it('ARM resets the payment', () => {
    const rows = amortize({ ...base, armYears: 5, armRate: 8 })
    expect(rows[59].payment).toBeCloseTo(1798.65, 2)
    expect(rows[60].payment).toBeGreaterThan(2000)
    expect(rows[359].balance).toBe(0)
  })
  it('points break-even', () => {
    const a = { ...base, rate: 5.5, fees: 6000 }
    const { cheaperAtStart, month } = breakEven(a, amortize(a), base, amortize(base))
    expect(cheaperAtStart).toBe(false)
    expect(month).toBeGreaterThan(30)
    expect(month).toBeLessThan(60)
    const arm = { ...base, rate: 5, armYears: 5, armRate: 9 }
    const r = breakEven(arm, amortize(arm), base, amortize(base))
    expect(r.cheaperAtStart).toBe(true)
    expect(r.month).toBeGreaterThan(60)
  })
})
