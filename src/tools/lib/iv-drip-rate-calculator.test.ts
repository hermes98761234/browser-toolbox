import { describe, expect, it } from 'vitest'
import { doseToMlHr, durationMin, gttPerMin, hm, mlHrFromGtt, mlPerHour } from './iv-drip-rate-calculator'

describe('iv drip', () => {
  it('textbook examples', () => {
    // 1000 mL over 8 h with 15 gtt/mL → 125 mL/hr, 31.25 gtt/min
    expect(mlPerHour(1000, 480)).toBe(125)
    expect(gttPerMin(125, 15)).toBeCloseTo(31.25)
    // microdrip: gtt/min equals mL/hr
    expect(gttPerMin(75, 60)).toBe(75)
    expect(durationMin(500, 100)).toBe(300)
    expect(mlHrFromGtt(25, 20)).toBe(75)
  })
  it('weight-based dosing', () => {
    // dopamine 5 mcg/kg/min, 80 kg, 400 mg in 250 mL (1.6 mg/mL) → 15 mL/hr
    expect(doseToMlHr(5, 'mcg/kg/min', 80, 400, 250)).toBeCloseTo(15, 6)
    // heparin 1000 units/hr, 25000 units in 500 mL → 20 mL/hr
    expect(doseToMlHr(1000, 'units/hr', 0, 25000, 500)).toBeCloseTo(20, 6)
    expect(hm(125)).toBe('2 h 05 min')
  })
})
