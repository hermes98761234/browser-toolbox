import { describe, expect, it } from 'vitest'
import { calcDose, matches, roundTo, type DoseInput } from './dose-by-weight-calculator'

const base: DoseInput = { weight: 18, dosePerKg: 15, unit: 'mg', basis: 'dose', freq: 4, maxSingle: 1000, maxDaily: 4000, form: 'liquid', concAmount: 120, concVolume: 5, round: 0.1 }

describe('dose-by-weight', () => {
  it('liquid: 18 kg × 15 mg/kg at 120 mg/5 mL', () => {
    const r = calcDose(base)
    expect(r.mgPerDose).toBe(270)
    expect(r.conc).toBe(24)
    expect(r.amountRaw).toBeCloseTo(11.25, 6)
    expect(r.amount).toBeCloseTo(11.3, 6)
    expect(r.deliveredMg).toBeCloseTo(271.2, 6)
    expect(r.mgPerDay).toBe(1080)
  })
  it('daily basis divides by frequency', () => {
    const r = calcDose({ ...base, dosePerKg: 45, basis: 'day', freq: 2, maxSingle: 0, maxDaily: 0, concAmount: 400, round: 0.5 })
    expect(r.mgPerDose).toBe(405)
    expect(r.amount).toBe(5) // 5.0625 → 5.0
  })
  it('caps single and daily', () => {
    expect(calcDose({ ...base, weight: 90 }).capped).toBe('single')
    expect(calcDose({ ...base, weight: 90 }).mgPerDose).toBe(1000)
    const d = calcDose({ ...base, weight: 60, maxSingle: 0, maxDaily: 3000 })
    expect(d.capped).toBe('daily')
    expect(d.mgPerDose).toBe(750)
  })
  it('mcg and tablets', () => {
    const r = calcDose({ ...base, weight: 20, dosePerKg: 500, unit: 'mcg', form: 'tablet', concAmount: 5, round: 0.5, maxSingle: 0, maxDaily: 0 })
    expect(r.mgPerDose).toBe(10)
    expect(r.amount).toBe(2)
    expect(r.deliveredPerKg).toBeCloseTo(500, 6)
  })
  it('rounding helpers', () => {
    expect(roundTo(2.25, 0.5)).toBe(2.5)
    expect(roundTo(0.3, 0.1)).toBe(0.3)
    expect(matches(11.3, 11.3, 0.1)).toBe(true)
    expect(matches(11.2, 11.3, 0.1)).toBe(false)
  })
})
