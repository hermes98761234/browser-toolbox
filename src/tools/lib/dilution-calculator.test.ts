import { describe, expect, it } from 'vitest'
import { convertConc, fmtConc, fmtVol, serial, solve, toL } from './dilution-calculator'

describe('dilution-calculator', () => {
  it('converts concentrations', () => {
    expect(convertConc(10, 'mM', 'µM')).toBeCloseTo(10000, 9)
    expect(convertConc(1, 'mg/mL', 'µg/mL')).toBeCloseTo(1000, 9)
    expect(convertConc(5, '% w/v', 'g/L')).toBeCloseTo(50, 9)
    expect(convertConc(1, 'M', 'g/L', 58.44)).toBeCloseTo(58.44, 9)
    expect(convertConc(58.44, 'mg/mL', 'M', 58.44)).toBeCloseTo(1, 9)
    expect(convertConc(1, 'M', 'g/L')).toBeNaN()
    expect(convertConc(10, 'X', 'M')).toBeNaN()
  })
  it('solves C1V1 = C2V2', () => {
    // 10 mM stock to 100 µM in 1 mL → 10 µL
    const v1 = solve('v1', { c1: 10000, c2: 100, v2: toL(1, 'mL'), v1: 0 })
    expect(v1).toBeCloseTo(10e-6, 12)
    expect(solve('c2', { c1: 10, v1: 1, v2: 4, c2: 0 })).toBe(2.5)
  })
  it('plans a serial dilution', () => {
    const t = serial(1000, 10, 4, 900e-6)
    expect(t.length).toBe(4)
    expect(t[0].transfer).toBeCloseTo(100e-6, 12)
    expect(t[3].conc).toBeCloseTo(0.1, 12)
    expect(t[3].discard).toBeCloseTo(100e-6, 12)
    expect(t[0].transfer / (t[0].transfer + t[0].diluent)).toBeCloseTo(0.1, 12)
    expect(serial(1, 1, 3, 1)).toEqual([])
  })
  it('formats', () => {
    expect(fmtVol(10e-6)).toBe('10 µL')
    expect(fmtVol(0.25)).toBe('250 mL')
    expect(fmtConc(0.1, 'mM')).toBe('100 µM')
    expect(fmtConc(2000, 'ng/mL')).toBe('2 µg/mL')
  })
})
