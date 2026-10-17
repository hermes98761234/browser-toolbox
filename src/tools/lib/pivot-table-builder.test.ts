import { describe, expect, it } from 'vitest'
import { aggregate, display, parseCsv, pivot, quantile, sampleCsv } from './pivot-table-builder'

const csv = 'cat,reg,v\na,N,1\na,S,2\nb,N,3\nb,N,5\n"c, quoted",S,"10"'

describe('pivot table builder', () => {
  it('parses CSV with quotes and detects numeric columns', () => {
    const d = parseCsv(csv)
    expect(d.cols).toEqual(['cat', 'reg', 'v'])
    expect(d.rows[4][0]).toBe('c, quoted')
    expect(d.numeric).toEqual([false, false, true])
    expect(parseCsv('a;b\n1;2').cols).toEqual(['a', 'b'])
  })
  it('aggregates', () => {
    const v = ['2', '4', '4', '4', '5', '5', '7', '9']
    expect(aggregate('sum', v)).toBe(40)
    expect(aggregate('mean', v)).toBe(5)
    expect(aggregate('median', v)).toBe(4.5)
    expect(aggregate('std', v)).toBeCloseTo(2.13809, 4) // sample std
    expect(aggregate('distinct', v)).toBe(5)
    expect(aggregate('p25', v)).toBe(4)
    expect(quantile([1, 2, 3, 4], 0.9)).toBeCloseTo(3.7)
    expect(aggregate('std', ['1'])).toBeNaN()
  })
  it('pivots and computes shares from raw values', () => {
    const d = parseCsv(csv)
    const p = pivot(d, { rows: [0], cols: [1], values: [{ field: 2, agg: 'sum' }], filters: {} })
    expect(p.rowKeys).toEqual([['a'], ['b'], ['c, quoted']])
    expect(p.colKeys).toEqual([['N'], ['S']])
    const v = { field: 2, agg: 'sum' as const }
    expect(display(d, p, v, p.cells.get('b\u0001N'), 'value', ['b'], ['N'])).toBe(8)
    expect(display(d, p, v, p.cells.get('a\u0001S'), 'row', ['a'], ['S'])).toBeCloseTo(2 / 3)
    expect(display(d, p, v, p.cells.get('b\u0001N'), 'col', ['b'], ['N'])).toBeCloseTo(8 / 9)
    expect(display(d, p, v, p.all, 'total', null, null)).toBe(1)
    const med = { field: 2, agg: 'median' as const }
    expect(display(d, p, med, p.colIdx.get('N'), 'value', null, ['N'])).toBe(3)
  })
  it('applies exclusion filters', () => {
    const d = parseCsv(csv)
    const p = pivot(d, { rows: [0], cols: [], values: [], filters: { 1: ['S'] } })
    expect(p.all).toHaveLength(3)
  })
  it('sample data is well-formed', () => {
    const d = parseCsv(sampleCsv())
    expect(d.rows).toHaveLength(480)
    expect(d.numeric).toEqual([false, false, false, false, false, true, true, true])
  })
})
