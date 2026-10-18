import { describe, expect, it } from 'vitest'
import { adjust, corr, kendall, matrix, parseTable, pearson, sampleCsv, spearman, upgma } from './feature-correlation-matrix'

describe('correlations', () => {
  it('pearson and spearman reference values', () => {
    // Anscombe's quartet set I: r = 0.816
    const x = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5]
    const y = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]
    expect(pearson(x, y)).toBeCloseTo(0.81642, 4)
    expect(spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25])).toBeCloseTo(1, 10)
    // p for r = 0.816, n = 11: t = 4.24, p ≈ 0.00217
    expect(corr(x, y, 'pearson').p).toBeCloseTo(0.00217, 4)
  })
  it('kendall tau-b', () => {
    expect(kendall([1, 2, 3, 4, 5], [1, 3, 2, 5, 4]).tau).toBeCloseTo(0.6, 10)
    // With ties: x = [1,2,2,3], y = [1,2,3,3] → S = 4, n0 = 6, n1 = n2 = 1 → tau_b = 4/5
    expect(kendall([1, 2, 2, 3], [1, 2, 3, 3]).tau).toBeCloseTo(0.8, 10)
    // No-ties z = 3S / sqrt(n(n-1)(2n+5)/2)
    const { z } = kendall([1, 2, 3, 4, 5, 6, 7, 8], [2, 1, 4, 3, 6, 5, 8, 7])
    const S = 28 - 2 * 4
    expect(z).toBeCloseTo(S / Math.sqrt((8 * 7 * 21) / 18), 10)
  })
  it('skips missing values pairwise', () => {
    const c = corr([1, 2, NaN, 4, 5], [2, 4, 6, NaN, 10], 'pearson')
    expect(c.n).toBe(3)
    expect(c.r).toBeCloseTo(1, 10)
  })
})

describe('adjustment', () => {
  it('holm and BH', () => {
    const p = [0.01, 0.04, 0.03, 0.005]
    expect(adjust(p, 'holm')).toEqual([0.03, 0.06, 0.06, 0.02])
    const bh = adjust(p, 'bh')
    expect(bh[3]).toBeCloseTo(0.02, 10)
    expect(bh[0]).toBeCloseTo(0.02, 10)
    expect(bh[2]).toBeCloseTo(0.04, 10)
    expect(bh[1]).toBeCloseTo(0.04, 10)
  })
})

describe('clustering', () => {
  it('UPGMA on a textbook matrix', () => {
    // a,b close; c,d close; e far
    const D = [
      [0, 2, 6, 10, 9],
      [2, 0, 5, 9, 8],
      [6, 5, 0, 4, 5],
      [10, 9, 4, 0, 3],
      [9, 8, 5, 3, 0],
    ]
    const t = upgma(D)
    expect(t.merges[0]).toMatchObject({ a: 0, b: 1, h: 2 })
    expect(t.merges[1]).toMatchObject({ a: 3, b: 4, h: 3 })
    // c joins {d,e} at (4+5)/2 = 4.5
    expect(t.merges[2]).toMatchObject({ a: 2, b: 6, h: 4.5 })
    // {a,b} vs {c,d,e}: mean of 6,10,9,5,9,8 = 47/6
    expect(t.merges[3].h).toBeCloseTo(47 / 6, 10)
    expect(t.order).toEqual([0, 1, 2, 3, 4])
  })
  it('sample data parses and has structure', () => {
    const d = parseTable(sampleCsv())
    expect(d.names.length).toBe(10)
    const M = matrix(d, 'pearson')
    const ia = d.names.indexOf('area_m2'), ip = d.names.indexOf('price_k')
    expect(M[ia][ip].r).toBeGreaterThan(0.5)
  })
})
