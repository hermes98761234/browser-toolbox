import { describe, expect, it } from 'vitest'
import { awgArea, currentFromPower, drop, maxLength } from './voltage-drop-calculator'

const base = { system: '1ph' as const, V: 230, I: 16, L: 30, mm2: 2.5, parallel: 1, metal: 'cu' as const, tempC: 20, pf: 1, x: 0.08 }

describe('voltage drop', () => {
  it('AWG areas', () => {
    expect(awgArea(12)).toBeCloseTo(3.309, 2)
    expect(awgArea(10)).toBeCloseTo(5.261, 2)
    expect(awgArea(0)).toBeCloseTo(53.48, 1)
  })
  it('single phase copper', () => {
    const d = drop(base)
    expect(d.Vd).toBeCloseTo(2 * 16 * 30 * (0.017241 / 2.5), 6)
    expect(d.pct).toBeCloseTo(2.879, 2)
  })
  it('three phase with pf and reactance', () => {
    const d = drop({ ...base, system: '3ph', V: 400, I: 100, L: 100, mm2: 35, pf: 0.8, x: 0.08 })
    const R = 0.017241 / 35, X = 0.08e-3
    expect(d.Vd).toBeCloseTo(Math.sqrt(3) * 100 * 100 * (R * 0.8 + X * 0.6), 6)
  })
  it('temperature, aluminium, parallel, max length', () => {
    const hot = drop({ ...base, tempC: 75 })
    expect(hot.R / drop(base).R).toBeCloseTo(1 + 0.00393 * 55, 6)
    expect(drop({ ...base, metal: 'al' }).R).toBeCloseTo(0.028264 / 2.5, 8)
    expect(drop({ ...base, parallel: 2 }).Vd).toBeCloseTo(drop(base).Vd / 2, 8)
    expect(maxLength(base, 3)).toBeCloseTo(30 * 3 / 2.8789, 1)
    expect(currentFromPower('3ph', 10000, 400, 1)).toBeCloseTo(14.434, 3)
  })
})
