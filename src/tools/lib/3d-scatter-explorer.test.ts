import { describe, expect, it } from 'vitest'
import { inPolygon, loadTable, pearson, range, sampleCsv, scale } from './3d-scatter-explorer'

describe('3d scatter', () => {
  it('detects numeric and categorical columns', () => {
    const t = loadTable('name,x,y,grp\na,1,2,u\nb,3,4,v\nc,5,6,u\nd,7,8,v')
    expect(t.numeric).toEqual([1, 2])
    expect(t.categorical).toContain(3)
    expect(t.rows).toHaveLength(4)
  })
  it('sample has 215 rows and 4 numeric columns', () => {
    const t = loadTable(sampleCsv())
    expect(t.rows).toHaveLength(215)
    expect(t.numeric).toEqual([2, 3, 4, 5])
    expect(t.categorical).toEqual([0, 1, 6])
  })
  it('scales into cube', () => {
    const r = range([10, 20])
    expect(scale(10, r, 5)).toBe(-5)
    expect(scale(20, r, 5)).toBe(5)
    expect(range([3, 3])).toEqual({ min: 2, max: 4 })
  })
  it('point in polygon', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]
    expect(inPolygon(5, 5, sq)).toBe(true)
    expect(inPolygon(15, 5, sq)).toBe(false)
  })
  it('pearson', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1)
  })
})
