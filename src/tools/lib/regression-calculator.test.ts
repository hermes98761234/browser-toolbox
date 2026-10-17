import { describe, expect, it } from 'vitest'
import { compare, fitModel, latex, levenberg, parseXY, PRESETS, type Fit } from './regression-calculator'

const ok = (r: Fit | { error: string }) => {
  if ('error' in r) throw new Error(r.error)
  return r
}

describe('regression calculator', () => {
  it('parses two columns with a header', () => {
    const d = parseXY('speed,dist\n1,2\n3,4\nfoo\n')
    expect(d).toMatchObject({ x: [1, 3], y: [2, 4], xName: 'speed', yName: 'dist', skipped: 1 })
  })
  it('fits a straight line with textbook SE (Anscombe I)', () => {
    const x = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5], y = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]
    const f = ok(fitModel('linear', x, y))
    expect(f.params[0]).toBeCloseTo(3.0001, 3)
    expect(f.params[1]).toBeCloseTo(0.5001, 3)
    expect(f.se[1]).toBeCloseTo(0.1179, 3)
    expect(f.se[0]).toBeCloseTo(1.1247, 3)
    expect(f.r2).toBeCloseTo(0.6665, 3)
  })
  it('recovers an exact cubic even with offset x', () => {
    const x = [1000, 1001, 1002, 1003, 1004, 1005, 1006]
    const y = x.map((v) => 2 - 0.5 * (v - 1000) + 0.25 * (v - 1000) ** 3)
    const f = ok(fitModel('poly', x, y, 3))
    for (const v of [1000.5, 1003.3, 1006]) expect(f.predict(v)).toBeCloseTo(2 - 0.5 * (v - 1000) + 0.25 * (v - 1000) ** 3, 4)
    expect(f.r2).toBeCloseTo(1, 9)
  })
  it("finds Kepler's exponent 1.5", () => {
    const d = parseXY(PRESETS[0].text)
    const f = ok(fitModel('power', d.x, d.y))
    expect(f.params[1]).toBeCloseTo(1.5, 2)
    expect(f.params[0]).toBeCloseTo(1, 2)
  })
  it('recovers exponential and logistic parameters', () => {
    const x = Array.from({ length: 12 }, (_, i) => i)
    const e = ok(fitModel('exp', x, x.map((v) => 3 * Math.exp(-0.2 * v))))
    expect(e.params[0]).toBeCloseTo(3, 5)
    expect(e.params[1]).toBeCloseTo(-0.2, 5)
    const lg = ok(fitModel('logistic', x, x.map((v) => 5 / (1 + Math.exp(-1.3 * (v - 6))))))
    expect(lg.params[0]).toBeCloseTo(5, 3)
    expect(lg.params[1]).toBeCloseTo(1.3, 3)
    expect(lg.params[2]).toBeCloseTo(6, 3)
  })
  it('fits logarithmic models', () => {
    const x = [1, 2, 4, 8, 16]
    const f = ok(fitModel('log', x, x.map((v) => 10 + 3 * Math.log(v))))
    expect(f.params).toEqual([expect.closeTo(10, 8), expect.closeTo(3, 8)])
  })
  it('model comparison picks the generating model for each preset', () => {
    for (const p of PRESETS) {
      const d = parseXY(p.text)
      const r = compare(d.x, d.y, p.degree ?? 2).filter((c) => c.fit).sort((a, b) => a.fit!.aicc - b.fit!.aicc)
      expect(r[0].model).toBe(p.best)
    }
  })
  it('rejects invalid domains and writes LaTeX', () => {
    expect('error' in fitModel('power', [-1, 2, 3], [1, 2, 3])).toBe(true)
    const f = ok(fitModel('exp', [0, 1, 2, 3], [1, 2, 4, 8]))
    expect(latex(f)).toBe('y = 1\\,e^{0.69315\\,x}')
  })
  it('Levenberg–Marquardt minimises a simple quadratic', () => {
    const r = levenberg((x, p) => p[0] * x * x, [1, 2, 3], [2, 8, 18], [1])
    expect(r.p[0]).toBeCloseTo(2, 8)
  })
})
