import { describe, expect, it } from 'vitest'
import { between, betaI, DISTS, gammaP, lgamma, quantile } from './distribution-explorer'

const D = (id: string) => DISTS.find((d) => d.id === id)!

describe('distributions', () => {
  it('special functions', () => {
    expect(lgamma(5)).toBeCloseTo(Math.log(24), 12)
    expect(lgamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12)
    expect(gammaP(1, 2)).toBeCloseTo(1 - Math.exp(-2), 12)
    expect(betaI(0.5, 2, 3)).toBeCloseTo(0.6875, 12)
  })
  it('critical values', () => {
    expect(D('normal').cdf(1.959963985, [0, 1])).toBeCloseTo(0.975, 9)
    expect(quantile(D('normal'), [0, 1], 0.975)).toBeCloseTo(1.959964, 6)
    expect(D('t').cdf(2.228138852, [10])).toBeCloseTo(0.975, 8)
    expect(D('chi2').cdf(3.841458821, [1])).toBeCloseTo(0.95, 8)
    expect(quantile(D('chi2'), [10], 0.95)).toBeCloseTo(18.307038, 5)
    expect(D('f').cdf(4.964602744, [1, 10])).toBeCloseTo(0.95, 8)
  })
  it('discrete', () => {
    expect(D('binomial').cdf(3, [10, 0.5])).toBeCloseTo(176 / 1024, 12)
    expect(D('binomial').pdf(3, [10, 0.5])).toBeCloseTo(120 / 1024, 12)
    expect(D('poisson').cdf(2, [3])).toBeCloseTo(Math.exp(-3) * (1 + 3 + 4.5), 12)
    expect(between(D('poisson'), [3], 1, 2)).toBeCloseTo(Math.exp(-3) * (3 + 4.5), 12)
    expect(quantile(D('binomial'), [10, 0.5], 0.5)).toBe(5)
    expect(D('hyper').pdf(1, [52, 13, 5])).toBeCloseTo(0.4114, 4)
    expect(D('negbin').cdf(2, [3, 0.5])).toBeCloseTo(0.125 + 3 * 0.0625 + 6 * 0.03125, 12)
  })
  it('pdfs integrate to 1 and means match', () => {
    for (const d of DISTS.filter((x) => !x.discrete && x.id !== 'cauchy')) {
      const p = d.params.map((q) => q.def)
      const a = quantile(d, p, 1e-7), b = quantile(d, p, 1 - 1e-7)
      let s = 0, mu = 0
      const n = 20000
      for (let i = 0; i < n; i++) {
        const x = a + ((i + 0.5) * (b - a)) / n
        s += (d.pdf(x, p) * (b - a)) / n
        mu += (x * d.pdf(x, p) * (b - a)) / n
      }
      expect(s, d.id).toBeCloseTo(1, 3)
      expect(mu, d.id).toBeCloseTo(d.mean(p), 2)
    }
  })
})
