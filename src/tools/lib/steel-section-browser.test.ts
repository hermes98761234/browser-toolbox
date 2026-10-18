import { describe, expect, it } from 'vitest'
import { props, SECTIONS, select, torsion } from './steel-section-browser'

const get = (n: string) => SECTIONS.find((s) => s.name === n)!
const near = (a: number, b: number, tol = 0.02) => expect(Math.abs(a / b - 1)).toBeLessThan(tol)

// Published values (A cm², Iy cm⁴) from European section tables / AISC Manual (in², in⁴)
const EU: [string, number, number][] = [
  ['IPE 80', 7.64, 80.1], ['IPE 200', 28.5, 1943], ['IPE 300', 53.8, 8356], ['IPE 400', 84.5, 23130], ['IPE 600', 156, 92080],
  ['HEA 200', 53.8, 3692], ['HEA 300', 112.5, 18260], ['HEA 500', 197.5, 86970],
  ['HEA 100', 21.2, 349], ['HEA 160', 38.8, 1673], ['HEA 240', 76.8, 7763], ['HEA 360', 142.8, 33090], ['IPE 160', 20.1, 869], ['IPE 240', 39.1, 3892], ['IPE 360', 72.7, 16270], ['IPE 500', 116, 48200],
  ['HEB 100', 26.0, 450], ['HEB 160', 54.3, 2492], ['HEB 240', 106, 11260], ['HEB 400', 197.8, 57680], ['HEB 200', 78.1, 5696], ['HEB 300', 149.1, 25170], ['HEB 500', 238.6, 107200],
]
const US: [string, number, number][] = [
  ['W8x31', 9.12, 110], ['W10x49', 14.4, 272], ['W12x26', 7.65, 204], ['W14x90', 26.5, 999], ['W18x35', 10.3, 510], ['W24x55', 16.2, 1350], ['W30x99', 29.1, 3990],
  ['W8x10', 2.96, 30.8], ['W6x15', 4.43, 29.1], ['W10x12', 3.54, 53.8], ['W12x50', 14.6, 391], ['W12x65', 19.1, 533], ['W14x22', 6.49, 199], ['W14x30', 8.85, 291],
  ['W16x26', 7.68, 301], ['W16x40', 11.8, 518], ['W18x50', 14.7, 800], ['W21x44', 13.0, 843], ['W24x76', 22.4, 2100], ['W27x84', 24.8, 2850],
]

describe('steel sections', () => {
  it.each(EU)('%s matches published A and Iy within 2%%', (n, A, I) => {
    const p = props(get(n))
    near(p.A / 100, A)
    near(p.Iy / 1e4, I)
  })
  it.each(US)('%s matches AISC A and Ix within 2%%', (n, A, I) => {
    const p = props(get(n))
    near(p.A / 25.4 ** 2, A)
    near(p.Iy / 25.4 ** 4, I)
  })
  it('IPE 300 secondary properties', () => {
    const p = props(get('IPE 300'))
    near(p.Wply / 1e3, 628.4)
    near(p.Wely / 1e3, 557.1)
    near(p.Iz / 1e4, 603.8)
    near(p.iy, 124.6)
    near(torsion(get('IPE 300')) / 1e4, 20.1, 0.05)
    near(p.Iw / 1e6, 125900, 0.03)
    near(p.mass, 42.2)
    near(p.surface, 1.16)
  })
  it('every section is consistent', () => {
    for (const s of SECTIONS) {
      const p = props(s)
      expect(p.A).toBeGreaterThan(0)
      expect(p.Iy).toBeGreaterThan(p.Iz)
      expect(p.Wply).toBeGreaterThan(p.Wely)
    }
  })
  it('selects the lightest section meeting a demand', () => {
    const r = select({ families: ['IPE'], minIy: 8000e4, minWply: 0, maxH: 1000, maxMass: 1e9 })
    expect(r[0].name).toBe('IPE 300')
  })
})
