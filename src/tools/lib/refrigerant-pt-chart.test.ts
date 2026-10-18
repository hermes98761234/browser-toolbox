import { describe, expect, it } from 'vitest'
import { ATM, byId, fromKpa, psat, subcooling, superheat, toKpa, tsat } from './refrigerant-pt-chart'

// Reference saturation pressures (kPa abs). Pure fluids: NIST Chemistry WebBook.
// Blends: REFPROP-generated manufacturer tables, [bubble, dew].
const PURE: Record<string, [number, number][]> = {
  R134a: [[-30, 84.4], [0, 292.8], [25, 665.4], [50, 1317.9]],
  R22: [[-40, 105.2], [0, 497.6], [20, 910.0], [40, 1533.6]],
  R32: [[-30, 273.4], [0, 813.1], [20, 1474.6], [40, 2478.3]],
  R290: [[-30, 167.8], [0, 474.5], [20, 836.5], [50, 1713.3]],
  R600a: [[-10, 108.4], [0, 157.0], [20, 302.2], [60, 869.2]],
  R717: [[-30, 119.4], [0, 429.2], [20, 857.0], [40, 1554.5]],
  R744: [[-40, 1004.5], [-20, 1969.6], [0, 3485.1], [20, 5729.1]],
}
const BLEND: Record<string, [number, number, number][]> = {
  R410A: [[-30, 270.3, 269.4], [0, 800.7, 798.1], [20, 1447.6, 1443.0], [40, 2425.6, 2418.7]],
  R404A: [[-30, 207.8, 202.2], [0, 610.2, 600.3], [20, 1097.2, 1084.4], [40, 1829.4, 1814.6]],
  R407C: [[-30, 187.1, 138.7], [0, 567.9, 460.7], [20, 1037.6, 880.3], [40, 1749.0, 1541.3]],
}
const within = (a: number, b: number, tol = 0.01) => expect(Math.abs(a / b - 1)).toBeLessThan(tol)

describe('saturation curves vs reference tables (±1 %)', () => {
  for (const [id, pts] of Object.entries(PURE))
    it(id, () => {
      for (const [t, p] of pts) {
        within(psat(byId(id), t), p)
        within(psat(byId(id), t, 'bubble'), p)
      }
    })
  for (const [id, pts] of Object.entries(BLEND))
    it(`${id} bubble and dew`, () => {
      for (const [t, b, d] of pts) {
        within(psat(byId(id), t, 'bubble'), b)
        within(psat(byId(id), t, 'dew'), d)
      }
    })
  it('normal boiling points', () => {
    expect(tsat(byId('R134a'), 101.325)).toBeCloseTo(-26.07, 1)
    expect(tsat(byId('R22'), 101.325)).toBeCloseTo(-40.81, 1)
    expect(tsat(byId('R717'), 101.325)).toBeCloseTo(-33.33, 1)
  })
})

describe('inverse, units, SH/SC', () => {
  it('tsat inverts psat and rejects out-of-range', () => {
    const r = byId('R407C')
    expect(tsat(r, psat(r, 7.5, 'dew'), 'dew')).toBeCloseTo(7.5, 6)
    expect(tsat(byId('R744'), 9000)).toBeNaN()
    expect(psat(byId('R744'), 35)).toBeNaN()
  })
  it('gauge/absolute conversions', () => {
    expect(fromKpa(292.8, 'kPa', true)).toBeCloseTo(191.475, 3)
    expect(fromKpa(ATM, 'psi', false)).toBeCloseTo(14.696, 3)
    expect(toKpa(fromKpa(800, 'bar', true), 'bar', true)).toBeCloseTo(800, 9)
  })
  it('superheat uses dew, subcooling uses bubble', () => {
    const r = byId('R407C')
    const p = psat(r, 0, 'dew')
    expect(superheat(r, p, 6)).toBeCloseTo(6, 6)
    const pl = psat(r, 40, 'bubble')
    expect(subcooling(r, pl, 35)).toBeCloseTo(5, 6)
  })
})
