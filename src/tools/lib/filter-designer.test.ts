import { describe, expect, it } from 'vitest'
import { crossing, design, eng, eRound, gValues, response, sections, type Spec } from './filter-designer'

const base: Spec = { fam: 'butterworth', kind: 'lowpass', topology: 'sk', order: 4, fc: 1000, ripple: 0.5, rTarget: 10000, rSeries: 'exact', cSeries: 'exact' }
const mag = (h: [number, number]) => 20 * Math.log10(Math.hypot(h[0], h[1]))

describe('filter-designer', () => {
  it('E-series rounding', () => {
    expect(eRound(4800, 'E12')).toBe(4700)
    expect(eRound(0.0000000105, 'E6')).toBeCloseTo(1e-8, 15)
    expect(eRound(9700, 'E96')).toBe(9760)
    expect(eRound(1015, 'E96')).toBe(1020)
    expect(eRound(95, 'E24')).toBe(91)
  })
  it('Butterworth Q values', () => {
    expect(sections('butterworth', 4, 0).map((s) => s.Q.toFixed(4))).toEqual(['0.5412', '1.3066'])
  })
  it('Chebyshev g-values (0.5 dB, n=3)', () => {
    const g = gValues('chebyshev', 3, 0.5)
    expect(g[0]).toBeCloseTo(1.5963, 3)
    expect(g[1]).toBeCloseTo(1.0967, 3)
    expect(g[2]).toBeCloseTo(1.5963, 3)
  })
  it('Butterworth -3 dB at fc for every topology', () => {
    for (const topology of ['sk', 'lc', 'rc'] as const)
      for (const kind of ['lowpass', 'highpass'] as const) {
        const d = design({ ...base, topology, kind, order: 5 })
        expect(mag(response(d, 1000))).toBeCloseTo(-3.0103, 2)
      }
  })
  it('Chebyshev passband ripple stays within spec', () => {
    for (const topology of ['sk', 'lc'] as const)
      for (const order of [3, 4]) {
        const d = design({ ...base, fam: 'chebyshev', ripple: 1, topology, order })
        let mx = -99, mn = 99
        for (let f = 10; f <= 1000; f += 5) {
          const m = mag(response(d, f))
          mx = Math.max(mx, m)
          mn = Math.min(mn, m)
        }
        expect(mx - mn).toBeLessThan(1.01)
        expect(mx - mn).toBeGreaterThan(0.9)
        expect(mag(response(d, 1000))).toBeCloseTo(topology === 'sk' && order % 2 === 0 ? 0 : -1, 1)
      }
  })
  it('rounded design stays close and crossing works', () => {
    const d = design({ ...base, rSeries: 'E24', cSeries: 'E12' })
    const f3 = crossing(d, -3.0103, 10, 1e5)!
    expect(Math.abs(f3 - 1000) / 1000).toBeLessThan(0.08)
    expect(eng(4700, 'Ω')).toBe('4.7kΩ')
    expect(eng(1e-7, 'F')).toBe('100nF')
  })
})
