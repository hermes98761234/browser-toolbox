import { describe, expect, it } from 'vitest'
import { analyze, capability, histogram, monteCarlo, phi, predictedOut, sigmaOf, summarize, type Dim } from './tolerance-stack-up-tool'

const d = (id: string, dir: 1 | -1, nom: number, plus: number, minus: number, dist: Dim['dist'] = 'normal'): Dim => ({ id, name: id, dir, nom, plus, minus, dist, sigmas: 3 })

// Housing 50 ±0.1 minus two parts 20 ±0.05 and 29.8 ±0.08 → gap 0.2
const chain = [d('H', 1, 50, 0.1, 0.1), d('A', -1, 20, 0.05, 0.05), d('B', -1, 29.8, 0.08, 0.08)]

describe('tolerance stack-up', () => {
  it('worst case and RSS', () => {
    const a = analyze(chain)
    expect(a.nominal).toBeCloseTo(0.2, 10)
    expect(a.wcTol).toBeCloseTo(0.23, 10)
    expect(a.wcMin).toBeCloseTo(-0.03, 10)
    expect(a.wcMax).toBeCloseTo(0.43, 10)
    expect(a.rssTol).toBeCloseTo(Math.sqrt(0.01 + 0.0025 + 0.0064), 10)
    expect(a.mrssTol).toBeCloseTo(Math.min(0.23, 1.5 * a.rssTol), 10)
    expect(a.sigma).toBeCloseTo(a.rssTol / 3, 10)
    expect(a.contrib.reduce((s, c) => s + c.rss, 0)).toBeCloseTo(1, 10)
  })
  it('handles unilateral tolerances by shifting the mean', () => {
    const a = analyze([d('X', 1, 10, 0.2, 0), d('Y', -1, 5, 0, 0.1)])
    expect(a.nominal).toBe(5)
    expect(a.mean).toBeCloseTo(10.1 - 4.95, 10)
    expect(a.wcTol).toBeCloseTo(0.15, 10)
  })
  it('distribution sigmas', () => {
    expect(sigmaOf(d('u', 1, 0, 1, 1, 'uniform'))).toBeCloseTo(1 / Math.sqrt(3), 10)
    expect(sigmaOf(d('t', 1, 0, 1, 1, 'triangular'))).toBeCloseTo(1 / Math.sqrt(6), 10)
  })
  it('Monte Carlo agrees with RSS sigma', () => {
    const xs = monteCarlo(chain, 40000, 7)
    const s = summarize(xs)
    const a = analyze(chain)
    expect(s.mean).toBeCloseTo(0.2, 2)
    expect(s.sd / a.sigma).toBeGreaterThan(0.97)
    expect(s.sd / a.sigma).toBeLessThan(1.03)
    const h = histogram(xs, s.min, s.max, 20)
    expect(h.reduce((x, y) => x + y, 0)).toBe(40000)
  })
  it('normal CDF and capability', () => {
    expect(phi(0)).toBeCloseTo(0.5, 6)
    expect(phi(1.96)).toBeCloseTo(0.975, 3)
    expect(phi(-3)).toBeCloseTo(0.00135, 4)
    expect(predictedOut(0, 1, -3, 3)).toBeCloseTo(0.0027, 4)
    const c = capability(0.2, 0.05, 0, 0.5)
    expect(c.cp).toBeCloseTo(0.5 / 0.3, 10)
    expect(c.cpk).toBeCloseTo(0.2 / 0.15, 10)
  })
})
