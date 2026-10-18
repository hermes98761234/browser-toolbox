import { describe, expect, it } from 'vitest'
import { mulberry32, run, sampler, type Input } from './monte-carlo-simulator'

const moments = (i: Input, n = 200000) => {
  const s = sampler(i, mulberry32(42))
  let m = 0, q = 0
  for (let k = 0; k < n; k++) {
    const v = s()
    m += v
    q += v * v
  }
  m /= n
  return { m, sd: Math.sqrt(q / n - m * m) }
}

describe('samplers', () => {
  it('normal', () => {
    const r = moments({ name: 'x', dist: 'normal', a: 10, b: 2, c: 0 })
    expect(r.m).toBeCloseTo(10, 1)
    expect(r.sd).toBeCloseTo(2, 1)
  })
  it('triangular and PERT means', () => {
    expect(moments({ name: 'x', dist: 'triangular', a: 1, b: 2, c: 6 }).m).toBeCloseTo(3, 1)
    const p = moments({ name: 'x', dist: 'pert', a: 12, b: 14, c: 19 })
    expect(p.m).toBeCloseTo((12 + 4 * 14 + 19) / 6, 1)
    expect(p.sd).toBeCloseTo(Math.sqrt(((p.m - 12) * (19 - p.m)) / 7), 1)
  })
  it('lognormal by mean and sd, uniform', () => {
    const r = moments({ name: 'x', dist: 'lognormal', a: 50, b: 10, c: 0 })
    expect(r.m).toBeCloseTo(50, 0)
    expect(r.sd).toBeCloseTo(10, 0)
    const u = moments({ name: 'x', dist: 'uniform', a: 0, b: 12, c: 0 })
    expect(u.sd).toBeCloseTo(Math.sqrt(12), 1)
  })
})

describe('simulation', () => {
  it('sum of normals and percentiles', () => {
    const r = run('a + b', [{ name: 'a', dist: 'normal', a: 1, b: 3, c: 0 }, { name: 'b', dist: 'normal', a: 2, b: 4, c: 0 }], 100000, 7, 0)
    expect(r.mean).toBeCloseTo(3, 1)
    expect(r.sd).toBeCloseTo(5, 1)
    expect(r.pct.P50).toBeCloseTo(3, 1)
    expect(r.pct.P95).toBeCloseTo(3 + 1.645 * 5, 0)
    expect(r.pBelow).toBeCloseTo(0.2743, 2) // P(Z < −0.6)
  })
  it('sensitivity ranks the dominant input first', () => {
    const r = run('2*big + small', [{ name: 'small', dist: 'uniform', a: 0, b: 1, c: 0 }, { name: 'big', dist: 'uniform', a: 0, b: 10, c: 0 }], 20000, 3, 0)
    expect(r.spearman[0].name).toBe('big')
    expect(r.tornado[0].name).toBe('big')
    expect(r.tornado[0].hi - r.tornado[0].lo).toBeCloseTo(2 * 8, 0)
    expect(r.hist.reduce((a, h) => a + h.count, 0)).toBeGreaterThan(19900)
  })
  it('is reproducible for a seed', () => {
    const i: Input[] = [{ name: 'x', dist: 'pert', a: 0, b: 1, c: 5 }]
    expect(run('x^2', i, 1000, 9, 0).mean).toBe(run('x^2', i, 1000, 9, 0).mean)
  })
})
