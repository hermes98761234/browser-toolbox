import { describe, expect, it } from 'vitest'
import {
  anovaOneWay, chi2Cdf, chi2Inv, chiSquareGOF, chiSquareIndependence, correlation, fCdf, fInv, mannWhitney, normCdf, normInv,
  oneProportionZ, pairedT, tCdf, tInv, twoProportionZ, twoSampleT, wilcoxonSignedRank, lnGamma,
} from './statistics-calculator'

// R's built-in "sleep" data (Cushny & Peebles), extra hours of sleep for two drugs
const g1 = [0.7, -1.6, -0.2, -1.2, -0.1, 3.4, 3.7, 0.8, 0.0, 2.0]
const g2 = [1.9, 0.8, 1.1, 0.1, -0.1, 4.4, 5.5, 1.6, 4.6, 3.4]

describe('distributions (R reference values)', () => {
  it('normal', () => {
    expect(normCdf(1.96)).toBeCloseTo(0.9750021, 6)
    expect(normCdf(-3)).toBeCloseTo(0.001349898, 8)
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5)
    expect(normInv(0.001)).toBeCloseTo(-3.090232, 5)
  })
  it('t, chi-square, F', () => {
    expect(tCdf(2, 5)).toBeCloseTo(0.9490303, 6)
    expect(tInv(0.975, 10)).toBeCloseTo(2.228139, 5)
    expect(tInv(0.995, 3)).toBeCloseTo(5.840909, 4)
    expect(chi2Inv(0.95, 1)).toBeCloseTo(3.841459, 5)
    expect(chi2Inv(0.95, 10)).toBeCloseTo(18.30704, 4)
    expect(chi2Cdf(14, 2)).toBeCloseTo(1 - Math.exp(-7), 10)
    expect(fInv(0.95, 2, 10)).toBeCloseTo(4.102821, 4)
    expect(fCdf(1, 5, 5)).toBeCloseTo(0.5, 8)
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 10)
  })
})

describe('tests against R', () => {
  it('Welch t-test (t.test(extra ~ group, sleep))', () => {
    const r = twoSampleT(g1, g2, true)
    expect(r.stat).toBeCloseTo(-1.860813, 5)
    expect(r.df as number).toBeCloseTo(17.77647, 4)
    expect(r.p).toBeCloseTo(0.07939414, 5)
    expect(r.ci![0]).toBeCloseTo(-3.3654832, 4)
  })
  it('pooled t-test', () => {
    const r = twoSampleT(g1, g2, false)
    expect(r.df).toBe(18)
    expect(r.p).toBeCloseTo(0.07918671, 5)
  })
  it('paired t-test', () => {
    const r = pairedT(g1, g2)
    expect(r.stat).toBeCloseTo(-4.062128, 5)
    expect(r.p).toBeCloseTo(0.002832890, 6)
  })
  it('Mann–Whitney with ties', () => {
    const r = mannWhitney(g1, g2)
    expect(r.stat).toBe(25.5)
    expect(r.p).toBeCloseTo(0.06932758, 4)
  })
  it('Wilcoxon signed-rank paired (ties/zeros → normal approx)', () => {
    const r = wilcoxonSignedRank(g1, g2)
    expect(r.stat).toBe(0)
    expect(r.p).toBeCloseTo(0.009090698, 4)
  })
  it('Wilcoxon exact for small n without ties', () => {
    // all 5 differences positive: exact two-sided p = 2/32
    const r = wilcoxonSignedRank([1, 2, 3, 4, 5], null, 0)
    expect(r.p).toBeCloseTo(0.0625, 10)
  })
  it('chi-square GOF', () => {
    const r = chiSquareGOF([20, 30, 50])
    expect(r.stat).toBeCloseTo(14, 8)
    expect(r.p).toBeCloseTo(Math.exp(-7), 8)
  })
  it('chi-square independence 2x2', () => {
    // hand computed: [[10,20],[30,40]] → χ² = 0.7937
    const r = chiSquareIndependence([[10, 20], [30, 40]])
    expect(r.stat).toBeCloseTo(0.7936508, 6)
    expect(r.df).toBe(1)
  })
  it('one-way ANOVA', () => {
    const r = anovaOneWay([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
    expect(r.stat).toBeCloseTo(27, 8) // SSB=54 df 2, SSW=6 df 6
    expect(r.p).toBeCloseTo(1 - fCdf(27, 2, 6), 12)
    expect(r.effect!.value).toBeCloseTo(0.9, 8)
  })
  it('proportions', () => {
    const r = oneProportionZ(60, 100, 0.5)
    expect(r.stat).toBeCloseTo(2, 10)
    expect(r.p).toBeCloseTo(0.04550026, 6)
    const r2 = twoProportionZ(45, 100, 30, 100)
    expect(r2.stat).toBeCloseTo(2.19089, 4)
  })
  it('correlations', () => {
    const x = [1, 2, 3, 4, 5]
    const p = correlation(x, [2, 4, 6, 8, 10], 'pearson')
    expect(p.effect!.value).toBeCloseTo(1, 10)
    const s = correlation(x, [1, 4, 9, 16, 25], 'spearman')
    expect(s.effect!.value).toBeCloseTo(1, 10)
    const q = correlation(g1, g2, 'pearson')
    expect(q.effect!.value).toBeCloseTo(0.7951702, 5)
  })
})
