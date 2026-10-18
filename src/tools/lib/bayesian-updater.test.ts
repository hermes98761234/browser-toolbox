import { describe, expect, it } from 'vitest'
import { cdf, equalTailed, hdi, likelihoodDist, mean, mode, parseBatches, pdf, quantile, sd, sequence, update, type Dist } from './bayesian-updater'

describe('bayesian updater', () => {
  it('beta-binomial update', () => {
    const post = update({ kind: 'beta', a: 1, b: 1 }, { label: '', k: 7, n: 10 })
    expect(post).toEqual({ kind: 'beta', a: 8, b: 4 })
    expect(mean(post)).toBeCloseTo(2 / 3)
    expect(mode(post)).toBeCloseTo(0.7)
    expect(sd(post)).toBeCloseTo(Math.sqrt((8 * 4) / (144 * 13)))
    // Beta(8,4) 95% equal-tailed interval ≈ [0.390, 0.891]
    const [lo, hi] = equalTailed(post, 0.95)
    expect(lo).toBeCloseTo(0.39, 2)
    expect(hi).toBeCloseTo(0.891, 2)
    expect(cdf(post, hi) - cdf(post, lo)).toBeCloseTo(0.95, 6)
  })
  it('HDI is shorter than equal-tailed and has equal density at both ends', () => {
    const d: Dist = { kind: 'beta', a: 3, b: 12 }
    const [a, b] = hdi(d, 0.9), [c, e] = equalTailed(d, 0.9)
    expect(b - a).toBeLessThan(e - c)
    expect(cdf(d, b) - cdf(d, a)).toBeCloseTo(0.9, 5)
    expect(pdf(d, a)).toBeCloseTo(pdf(d, b), 2)
  })
  it('gamma-Poisson update and quantiles', () => {
    const post = sequence({ kind: 'gamma', a: 2, b: 1 }, [{ label: '', count: 3, exposure: 1 }, { label: '', count: 5, exposure: 1 }]).at(-1)!
    expect(post).toEqual({ kind: 'gamma', a: 10, b: 3 })
    expect(mean(post)).toBeCloseTo(10 / 3)
    // Gamma(shape 1, rate 1) is Exp(1): median ln 2
    expect(quantile({ kind: 'gamma', a: 1, b: 1 }, 0.5)).toBeCloseTo(Math.LN2, 6)
  })
  it('normal-normal update with known sigma', () => {
    const post = update({ kind: 'normal', a: 0, b: 1 }, { label: '', xs: [2] }, 1)
    expect(post.a).toBeCloseTo(1)
    expect(post.b).toBeCloseTo(Math.sqrt(0.5))
    const p2 = update({ kind: 'normal', a: 10, b: 100 }, { label: '', xs: [4, 6, 5, 5] }, 2)
    expect(p2.a).toBeCloseTo(5, 2) // vague prior → sample mean
    expect(p2.b).toBeCloseTo(1, 3)
    expect(equalTailed(p2, 0.95)[1]).toBeCloseTo(p2.a + 1.96 * p2.b, 2)
  })
  it('sequential updating equals one batch update', () => {
    const a = sequence({ kind: 'beta', a: 2, b: 2 }, [{ label: '', k: 1, n: 4 }, { label: '', k: 6, n: 8 }]).at(-1)!
    const b = update({ kind: 'beta', a: 2, b: 2 }, { label: '', k: 7, n: 12 })
    expect(a).toEqual(b)
    const xs = [1.2, 0.8, 1.9, 1.4]
    const n1 = sequence({ kind: 'normal', a: 0, b: 2 }, xs.map((x) => ({ label: '', xs: [x] })), 1.5).at(-1)!
    const n2 = update({ kind: 'normal', a: 0, b: 2 }, { label: '', xs }, 1.5)
    expect(n1.a).toBeCloseTo(n2.a, 10)
    expect(n1.b).toBeCloseTo(n2.b, 10)
  })
  it('parses batches for each model', () => {
    expect(parseBatches('beta', '3/10 # day 1\n1 0 1 1').batches).toMatchObject([{ k: 3, n: 10, label: 'day 1' }, { k: 3, n: 4 }])
    expect(parseBatches('beta', '5/3').errors.length).toBe(1)
    expect(parseBatches('gamma', '12/4\n1 2 0').batches).toMatchObject([{ count: 12, exposure: 4 }, { count: 3, exposure: 3 }])
    expect(parseBatches('normal', '1, 2.5 3').batches[0].xs).toEqual([1, 2.5, 3])
    expect(likelihoodDist('beta', [{ label: '', k: 3, n: 10 }])).toEqual({ kind: 'beta', a: 4, b: 8 })
  })
})
