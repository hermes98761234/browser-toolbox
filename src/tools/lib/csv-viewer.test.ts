import { describe, expect, it } from 'vitest'
import { colWidth, makeFilter, sortRows } from './csv-viewer'

describe('makeFilter', () => {
  it('contains / exact / not', () => {
    expect(makeFilter('ber')('Berlin')).toBe(true)
    expect(makeFilter('=berlin')('Berlin')).toBe(true)
    expect(makeFilter('=ber')('Berlin')).toBe(false)
    expect(makeFilter('!ber')('Paris')).toBe(true)
  })
  it('numeric comparisons and ranges', () => {
    expect(makeFilter('>100')('1,250')).toBe(true)
    expect(makeFilter('<=5')('5')).toBe(true)
    expect(makeFilter('>100')('abc')).toBe(false)
    expect(makeFilter('10..20')('15.5')).toBe(true)
    expect(makeFilter('10..20')('25')).toBe(false)
  })
  it('dates and empties', () => {
    expect(makeFilter('>2024-01-01')('2024-03-05')).toBe(true)
    expect(makeFilter('2024-01-01..2024-01-31')('2024-02-01')).toBe(false)
    expect(makeFilter('empty')('N/A')).toBe(true)
    expect(makeFilter('!empty')('x')).toBe(true)
  })
})

describe('sortRows', () => {
  const rows = [['b', '10'], ['a', '9'], ['c', ''], ['A', '100']]
  it('numeric asc/desc with missing last', () => {
    expect(sortRows(rows, [0, 1, 2, 3], 1, 'integer', 1)).toEqual([1, 0, 3, 2])
    expect(sortRows(rows, [0, 1, 2, 3], 1, 'integer', -1)).toEqual([3, 0, 1, 2])
  })
  it('text is case-insensitive and stable', () => {
    expect(sortRows(rows, [0, 1, 2, 3], 0, 'text', 1)).toEqual([1, 3, 0, 2])
  })
  it('colWidth bounds', () => {
    expect(colWidth('id', ['1'])).toBe(70)
    expect(colWidth('x', ['y'.repeat(500)])).toBe(320)
  })
})
