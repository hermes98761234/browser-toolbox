import { describe, expect, it } from 'vitest'
import { halfLife, mileageFactor, rateAt, schedule, type Input } from './car-depreciation-calculator'

const base: Input = { price: 30000, ageAtPurchase: 0, odoAtPurchase: 0, years: 3, perYear: 12000, expectedPerYear: 12000, kPer1000: 0.4, rates: [20, 15, 10], condition: 0 }

describe('car depreciation', () => {
  it('compounds yearly rates at normal mileage', () => {
    const r = schedule(base)
    expect(r[0].value).toBe(30000)
    expect(r[1].value).toBeCloseTo(24000, 6)
    expect(r[2].value).toBeCloseTo(20400, 6)
    expect(r[3].value).toBeCloseTo(18360, 6)
    expect(r[3].lostPct).toBeCloseTo(0.388, 3)
    expect(r[3].perDistance).toBeCloseTo(11640 / 36000, 9)
  })
  it('last rate repeats; mileage factor', () => {
    expect(rateAt([20, 10], 7)).toBe(10)
    expect(mileageFactor(30000, 20000, 0.5)).toBeCloseTo(0.95, 9)
    expect(mileageFactor(0, 200000, 1)).toBe(1.15)
  })
  it('high mileage and condition lower the value', () => {
    const hi = schedule({ ...base, perYear: 22000, condition: -8 })
    expect(hi[1].value).toBeCloseTo(24000 * 0.96 * 0.92, 6)
  })
  it('used purchase starts later on the curve', () => {
    const r = schedule({ ...base, ageAtPurchase: 2, odoAtPurchase: 24000, rates: [20, 15, 10, 8] })
    expect(r[1].rate).toBe(10)
    expect(r[1].value).toBeCloseTo(27000, 6)
    expect(halfLife(100, 0, [20, 15, 13, 12])).toBe(5)
  })
})
