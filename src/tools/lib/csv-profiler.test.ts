import { describe, expect, it } from 'vitest'
import { detectDelimiter, histogram, inferType, parseCsv, profileColumn, quantile, toDataset } from './csv-profiler'

describe('csv profiler', () => {
  it('parses RFC 4180', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n1,"multi\nline"\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['1', 'multi\nline']])
    expect(detectDelimiter('a;b;c\n1;2;3\n4;5;6')).toBe(';')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
  })
  it('infers types', () => {
    expect(inferType(['1', '2', '', '30'])).toBe('integer')
    expect(inferType(['1.5', '2', 'NA'])).toBe('number')
    expect(inferType(['yes', 'no', 'yes'])).toBe('boolean')
    expect(inferType(['2024-01-02', '2023-12-31'])).toBe('date')
    expect(inferType(['apple', '2'])).toBe('text')
    expect(inferType(['', 'null'])).toBe('empty')
  })
  it('computes stats', () => {
    const p = profileColumn('x', ['1', '2', '3', '4', '', '100'])
    expect(p.missing).toBe(1)
    expect(p.mean).toBeCloseTo(22)
    expect(p.median).toBe(3)
    expect(p.std).toBeCloseTo(Math.sqrt((21 ** 2 + 20 ** 2 + 19 ** 2 + 18 ** 2 + 78 ** 2) / 4))
    expect(p.outliers).toBe(1)
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75)
    const h = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)
    expect(h.map((b) => b.n)).toEqual([2, 2, 2, 2, 3])
  })
  it('pads short rows', () => {
    const d = toDataset('a,b,c\n1,2\n3,4,5')
    expect(d.rows[0]).toEqual(['1', '2', ''])
  })
})
