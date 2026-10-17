import { describe, expect, it } from 'vitest'
import { columnStats, detect, loadCsv, quantile, sampleCsv, score } from './outlier-detector'

describe('outlier detector', () => {
  it('quantiles (type 7)', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(quantile(s, 0.25)).toBeCloseTo(3.25)
    expect(quantile(s, 0.5)).toBeCloseTo(5.5)
    expect(quantile(s, 0.75)).toBeCloseTo(7.75)
  })
  it('stats and fences', () => {
    const st = columnStats('x', 0, [2, 4, 4, 4, 5, 5, 7, 9], 1.5)
    expect(st.mean).toBe(5)
    expect(st.sd).toBeCloseTo(2.13809, 4)
    expect(st.median).toBe(4.5)
    expect(st.mad).toBe(0.5)
    expect(score(9, st, 'z')).toBeCloseTo(4 / 2.13809, 4)
    expect(score(9, st, 'mad')).toBeCloseTo((0.6745 * 4.5) / 0.5, 6)
  })
  it('finds planted anomalies in the sample', () => {
    const ds = loadCsv(sampleCsv())
    expect(ds.head).toEqual(['date', 'store', 'temperature_c', 'orders', 'basket_eur', 'returns'])
    expect(ds.numeric).toEqual([2, 3, 4, 5])
    const { flags } = detect(ds, ds.numeric, 'iqr', 3, 1.5)
    const rows = new Set(flags.map((f) => f.row))
    for (const r of [12, 27, 41, 50, 33]) expect(rows.has(r)).toBe(true)
    const z = detect(ds, ds.numeric, 'z', 3, 1.5)
    expect(z.flags.some((f) => f.row === 27 && f.col === 3)).toBe(true)
  })
})
