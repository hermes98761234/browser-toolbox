import { describe, expect, it } from 'vitest'
import { distinct, isNumericField, pivot, showAs, toGrid, toNum, type PivotCfg } from './pivot-table-tool'

const data = [
  { region: 'North', q: 'Q1', product: 'A', sales: '100' },
  { region: 'North', q: 'Q2', product: 'B', sales: '50' },
  { region: 'South', q: 'Q1', product: 'A', sales: '30' },
  { region: 'South', q: 'Q1', product: 'B', sales: '20' },
  { region: 'South', q: 'Q2', product: 'A', sales: '$1,000.00' },
]
const cfg = (p: Partial<PivotCfg>): PivotCfg => ({ rows: ['region'], cols: ['q'], val: 'sales', agg: 'sum', exclude: {}, ...p })

describe('pivot-table-tool', () => {
  it('parses numbers', () => {
    expect(toNum('$1,000.00')).toBe(1000)
    expect(toNum('(30)')).toBe(-30)
    expect(toNum('12,5')).toBe(12.5)
    expect(toNum('45%')).toBe(45)
    expect(toNum('abc')).toBeNaN()
  })
  it('sums with totals', () => {
    const p = pivot(data, cfg({}))
    expect(p.rowKeys).toEqual([['North'], ['South']])
    expect(p.colKeys).toEqual([['Q1'], ['Q2']])
    expect(p.cell(['South'], ['Q1'])).toBe(50)
    expect(p.rowTotal(['South'])).toBe(1050)
    expect(p.colTotal(['Q1'])).toBe(150)
    expect(p.grand).toBe(1200)
    expect(p.cell(['North'], ['Q3'])).toBeNaN()
  })
  it('supports other aggregators and filters', () => {
    expect(pivot(data, cfg({ agg: 'count' })).grand).toBe(5)
    expect(pivot(data, cfg({ agg: 'avg' })).rowTotal(['North'])).toBe(75)
    expect(pivot(data, cfg({ agg: 'median' })).grand).toBe(50)
    expect(pivot(data, cfg({ agg: 'countUnique', val: 'product' })).grand).toBe(2)
    const f = pivot(data, cfg({ exclude: { product: ['B'] } }))
    expect(f.grand).toBe(1130)
    expect(f.count).toBe(3)
  })
  it('computes percentages and grids', () => {
    expect(showAs(50, 'pctRow', 1050, 150, 1200)).toBeCloseTo(50 / 1050)
    expect(showAs(50, 'pctCol', 1050, 150, 1200)).toBeCloseTo(1 / 3)
    const p = pivot(data, cfg({}))
    const g = toGrid(p, cfg({}), 'value')
    expect(g[0]).toEqual(['region', 'Q1', 'Q2', 'Total'])
    expect(g[2]).toEqual(['South', 50, 1000, 1050])
    expect(g[3]).toEqual(['Total', 150, 1050, 1200])
  })
  it('lists distinct values and detects numeric fields', () => {
    expect(distinct(data, 'q')).toEqual([['Q1', 3], ['Q2', 2]])
    expect(isNumericField(data, 'sales')).toBe(true)
    expect(isNumericField(data, 'region')).toBe(false)
  })
})
