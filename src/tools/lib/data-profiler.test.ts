import { describe, expect, it } from 'vitest'
import { profileDataset } from './csv-profiler'
import { correlationMatrix, duplicateRows, flatten, issues, missingMap, numericColumns, parseAny, pearson, qualityScore, topPairs } from './data-profiler'

describe('data-profiler', () => {
  it('flattens nested JSON', () => {
    expect(flatten({ a: 1, b: { c: 'x', d: null }, e: [1, 2] })).toEqual({ a: '1', 'b.c': 'x', 'b.d': '', e: '[1,2]' })
  })
  it('parses JSON, NDJSON, wrapped JSON and CSV', () => {
    expect(parseAny('[{"a":1},{"a":2,"b":true}]')).toEqual({ format: 'json', ds: { header: ['a', 'b'], rows: [['1', ''], ['2', 'true']] } })
    expect(parseAny('{"a":1}\n{"a":3}').format).toBe('ndjson')
    expect(parseAny('{"data":[{"x":1}],"meta":{}}').ds.rows).toEqual([['1']])
    const c = parseAny('x;y\n1;2\n3;4')
    expect(c.format).toBe('csv')
    expect(c.ds.header).toEqual(['x', 'y'])
  })
  it('counts duplicates and correlations', () => {
    const ds = parseAny('a,b,c\n1,2,9\n2,4,7\n3,6,8\n4,8,1\n4,8,1').ds
    expect(duplicateRows(ds)).toBe(1)
    const prof = profileDataset(ds)
    const cols = numericColumns(ds, prof)
    const m = correlationMatrix(cols)
    expect(m[0][1]).toBeCloseTo(1, 10)
    expect(topPairs(cols, m)[0].slice(0, 2)).toEqual(['a', 'b'])
    expect(pearson([1, 2, 3, NaN], [3, 2, 1, 5])).toBeCloseTo(-1, 10)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNaN()
  })
  it('scores quality and lists issues', () => {
    const ds = parseAny('id,v,e\n1,,\n2,5,\n3,x,\n4,7,').ds
    const prof = profileDataset(ds)
    expect(qualityScore(prof, 4, 0)).toBeLessThan(100)
    const txt = issues(prof, 4).map((i) => `${i.col} ${i.text}`)
    expect(txt.some((t) => t.startsWith('e is completely empty'))).toBe(true)
    expect(missingMap(ds, 2)).toEqual([[0, 0.5, 1], [0, 0, 1]])
  })
})
