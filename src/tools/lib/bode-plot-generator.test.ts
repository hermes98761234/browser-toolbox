import { describe, expect, it } from 'vitest'
import { closedLoopPoles, margins, parsePoly, parseTf, phaseFn, roots, sweep } from './bode-plot-generator'

describe('bode maths', () => {
  it('parses polynomials', () => {
    expect(parsePoly('(s+1)(s+2)')).toEqual([2, 3, 1])
    expect(parsePoly('10*s^2 - 3s + 0.5')).toEqual([0.5, -3, 10])
    expect(parsePoly('s(s+1)^2/2')).toEqual([0, 0.5, 1, 0.5])
    expect(parseTf('[1 3 2]')).toEqual([2, 3, 1])
    expect(() => parsePoly('1/(s+1)')).toThrow()
  })
  it('finds roots', () => {
    const r = roots([6, 11, 6, 1]).map((z) => z[0]).sort((a, b) => a - b)
    expect(r[0]).toBeCloseTo(-3, 8)
    expect(r[2]).toBeCloseTo(-1, 8)
    const c = roots([1, 0, 1])
    expect(Math.abs(c[0][1])).toBeCloseTo(1, 8)
  })
  it('textbook margins: G = 1/(s(s+1)(s+2))', () => {
    const tf = { num: [1], den: parsePoly('s(s+1)(s+2)'), delay: 0 }
    const m = margins(tf)
    expect(m.wgm!).toBeCloseTo(Math.SQRT2, 4)
    expect(m.gm!).toBeCloseTo(20 * Math.log10(6), 3) // 15.563 dB
    expect(m.wpm!).toBeCloseTo(0.4457, 3)
    expect(m.pm!).toBeCloseTo(53.41, 1)
    expect(phaseFn(tf)(1e-3)).toBeCloseTo(-90, 0)
  })
  it('K/(s+1)^3 with K=8 is marginally stable', () => {
    const tf = { num: [8], den: parsePoly('(s+1)^3'), delay: 0 }
    const m = margins(tf)
    expect(m.gm!).toBeCloseTo(0, 4)
    expect(m.wgm!).toBeCloseTo(Math.sqrt(3), 4)
    expect(Math.max(...closedLoopPoles(tf).map((p) => p[0]))).toBeCloseTo(0, 6)
  })
  it('first-order lag bandwidth and delay phase', () => {
    const tf = { num: [1], den: [1, 1], delay: 0 }
    expect(margins(tf).bandwidth!).toBeCloseTo(0.9976, 3) // −3 dB (≈ −3.0103 dB at ω = 1)
    const d = sweep({ num: [1], den: [1], delay: 0.5 }, 1, 1, 2)
    expect(d[0].phase).toBeCloseTo((-0.5 * 180) / Math.PI, 6)
    expect(d[0].db).toBeCloseTo(0, 9)
  })
})
