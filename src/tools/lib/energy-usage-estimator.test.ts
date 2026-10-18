import { describe, expect, it } from 'vitest'
import { analyse, kwhPerDay, pricePerKwh, runCost, standbyKwhPerDay, type Appliance, type Tariff } from './energy-usage-estimator'

const A = (p: Partial<Appliance>): Appliance => ({ id: 'x', name: 'x', cat: 'x', watts: 100, duty: 1, standby: 0, hours: 1, days: 7, qty: 1, offPeak: 0, ...p })

describe('energy usage', () => {
  it('100 W for 10 h a day = 1 kWh', () => {
    expect(kwhPerDay(A({ hours: 10 }))).toBeCloseTo(1, 9)
  })
  it('duty cycle, days per week, quantity and standby', () => {
    // fridge 150 W, 24 h, 35 % duty → 1.26 kWh
    expect(kwhPerDay(A({ watts: 150, hours: 24, duty: 0.35 }))).toBeCloseTo(1.26, 9)
    // 2000 W for 1 h on 3.5 days a week → 1 kWh/day average
    expect(kwhPerDay(A({ watts: 2000, hours: 1, days: 3.5 }))).toBeCloseTo(1, 9)
    // TV 100 W 4 h, 1 W standby 20 h, two units
    expect(kwhPerDay(A({ hours: 4, standby: 1, qty: 2 }))).toBeCloseTo((2 * (400 + 20)) / 1000, 9)
    expect(standbyKwhPerDay(A({ hours: 4, standby: 1, qty: 2 }))).toBeCloseTo(0.04, 9)
  })
  it('tariffs', () => {
    const tou: Tariff = { mode: 'tou', rate: 0.3, peak: 0.4, offPeakRate: 0.1, daily: 0.5 }
    expect(pricePerKwh(A({ offPeak: 0.5 }), tou)).toBeCloseTo(0.25, 9)
    expect(pricePerKwh(A({ offPeak: 0.5 }), { ...tou, mode: 'flat' })).toBe(0.3)
    const r = analyse([A({ hours: 10 })], { ...tou, mode: 'flat' })
    expect(r.kwhYear).toBeCloseTo(365, 9)
    expect(r.energyCost).toBeCloseTo(109.5, 9)
    expect(r.totalYear).toBeCloseTo(109.5 + 182.5, 9)
    expect(runCost(2000, 30, 0.3)).toBeCloseTo(0.3, 9)
  })
})
