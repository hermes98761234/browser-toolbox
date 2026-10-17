import { describe, expect, it } from 'vitest'
import { anova, chi2Cdf, chiGof, chiIndependence, correlation, critical, fCdf, mannWhitney, normCdf, oneSampleT, pairedT, tCdf, twoProportionZ, twoSampleT } from './hypothesis-test-wizard'

describe('distributions', () => {
  it('matches reference values', () => {
    expect(normCdf(1.96)).toBeCloseTo(0.975, 4)
    expect(tCdf(2.228, 10)).toBeCloseTo(0.975, 3)
    expect(chi2Cdf(3.841, 1)).toBeCloseTo(0.95, 3)
    expect(fCdf(3.89, 2, 12)).toBeCloseTo(0.95, 2)
    expect(critical({ kind: 't', df: 20 }, 0.05, 'two')).toBeCloseTo(2.086, 3)
    expect(critical({ kind: 'chi2', df: 3 }, 0.05, 'greater')).toBeCloseTo(7.815, 3)
  })
})

describe('tests', () => {
  it('one-sample t', () => {
    const r = oneSampleT([5.1, 4.9, 5.6, 5.8, 6.0, 5.4, 5.2], 5, 'two')
    expect(r.stat).toBeCloseTo(2.8735, 3) // mean 5.4286, sd 0.3946
    expect(r.p).toBeGreaterThan(0.02)
    expect(r.p).toBeLessThan(0.035)
  })
  it('Welch t', () => {
    const r = twoSampleT([19.1, 20.3, 21.2, 18.8, 20.0], [22.1, 23.4, 21.8, 24.0, 22.9], 'two', false)
    expect(r.stat).toBeLessThan(-4)
    expect(r.p).toBeLessThan(0.01)
  })
  it('paired t', () => {
    const r = pairedT([10, 12, 9, 11, 13], [9, 10, 9, 10, 11], 'two')
    expect(r.stat).toBeCloseTo(3.2071, 3)
  })
  it('ANOVA', () => {
    const r = anova([[1, 2, 3], [2, 3, 4], [5, 6, 7]])
    expect(r.stat).toBeCloseTo(13, 6)
    expect(r.p).toBeCloseTo(0.006566, 4)
  })
  it('chi-square', () => {
    const r = chiIndependence([[10, 20], [30, 40]])
    expect(r.stat).toBeCloseTo(0.7937, 3)
    expect(chiGof([50, 30, 20], [1, 1, 1]).stat).toBeCloseTo(14, 6)
  })
  it('proportions and correlation', () => {
    const r = twoProportionZ(45, 100, 30, 100, 'two')
    expect(r.stat).toBeCloseTo(2.1909, 3)
    const c = correlation([1, 2, 3, 4, 5], [2, 4, 5, 4, 5], 'two')
    expect(c.effect![1]).toBeCloseTo(0.7746, 3)
  })
  it('Mann-Whitney', () => {
    const r = mannWhitney([1, 2, 3, 4], [5, 6, 7, 8], 'two')
    expect(r.p).toBeLessThan(0.05)
  })
})
