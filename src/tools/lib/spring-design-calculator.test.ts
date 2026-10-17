import { describe, expect, it } from 'vitest'
import { analyse, bergstrasser, MATERIALS, rate, sut, wahl } from './spring-design-calculator'

describe('compression spring', () => {
  it('rate, factors and strength', () => {
    expect(rate(79300, 2, 20, 10)).toBeCloseTo(1.9825, 4)
    expect(wahl(10)).toBeCloseTo(1.1448, 4)
    expect(bergstrasser(10)).toBeCloseTo(42 / 37, 6)
    expect(sut(MATERIALS.music, 2)).toBeCloseTo(1999.6, 0)
  })
  it('solid length and coils by end type', () => {
    const base = { d: 2, D: 16, Na: 8, L0: 50, mat: 'music', Fmax: 40, Fmin: 10, seating: 'fixed' as const }
    expect(analyse({ ...base, ends: 'squaredGround' }).Ls).toBeCloseTo(20)
    expect(analyse({ ...base, ends: 'squared' }).Ls).toBeCloseTo(22)
    expect(analyse({ ...base, ends: 'plain' }).Ls).toBeCloseTo(18)
    expect(analyse({ ...base, ends: 'plainGround' }).Nt).toBe(9)
  })
  it('shear stress at load (Shigley style)', () => {
    const r = analyse({ d: 2, D: 16, Na: 8, L0: 50, ends: 'squaredGround', mat: 'music', Fmax: 40, Fmin: 10, seating: 'fixed' })
    // τ = KB·8FD/(πd³) with C = 8 → KB = 34/29
    expect(r.tauMax).toBeCloseTo(((34 / 29) * 8 * 40 * 16) / (Math.PI * 8), 6)
    expect(r.k).toBeCloseTo((81700 * 16) / (8 * 4096 * 8), 6)
    expect(r.Lcrit).toBeCloseTo((2.63 * 16) / 0.5, 6)
  })
})
