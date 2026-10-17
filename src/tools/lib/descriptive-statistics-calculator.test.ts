import { describe as d, expect, it } from 'vitest'
import { binCount, describe, histogram, parseData, quantile, SAMPLE, tInv } from './descriptive-statistics-calculator'

const X = [2, 4, 4, 4, 5, 5, 7, 9]

d('descriptive-statistics-calculator', () => {
  it('basic moments', () => {
    const s = describe(X)
    expect(s.mean).toBe(5)
    expect(s.sdP).toBe(2)
    expect(s.sdS).toBeCloseTo(2.13809, 5)
    expect(s.modes).toEqual([4])
    expect(s.median).toBe(4.5)
    expect(s.skew).toBeCloseTo(0.8185, 4) // Excel SKEW
    expect(s.kurt).toBeCloseTo(0.940625, 5) // Excel KURT
    expect(s.gmean).toBeCloseTo(4.603216, 5)
  })
  it('quantile methods match Excel', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(quantile(s, 0.25, 'r7')).toBe(3.25) // QUARTILE.INC
    expect(quantile(s, 0.25, 'r6')).toBe(2.75) // QUARTILE.EXC
    expect(quantile(s, 0.25, 'tukey')).toBe(3)
    expect(quantile(s, 0.25, 'nearest')).toBe(3)
  })
  it('t quantile and confidence interval', () => {
    expect(tInv(0.975, 10)).toBeCloseTo(2.228139, 5)
    expect(tInv(0.975, 1)).toBeCloseTo(12.7062, 3)
    const s = describe(X)
    expect(s.ci[1] - s.mean).toBeCloseTo(2.364624 * (s.sdS / Math.sqrt(8)), 4)
  })
  it('parses CSV columns and loose numbers', () => {
    const p = parseData(SAMPLE)
    expect(p.map((x) => x.name)).toEqual(['Group A', 'Group B', 'Group C'])
    expect(p[0].values).toHaveLength(15)
    const q = parseData('1 2, 3; x 4\n5')
    expect(q[0].values).toEqual([1, 2, 3, 4, 5])
    expect(q[0].skipped).toBe(1)
    expect(describe(p[2].values).outliers).toEqual([24.5])
  })
  it('histogram bins', () => {
    const s = describe(X)
    expect(binCount(s, 'sturges')).toBe(4)
    expect(histogram(s.sorted, 4).reduce((a, b) => a + b.n, 0)).toBe(8)
  })
})
