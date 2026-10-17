import { describe, expect, it } from 'vitest'
import { applyCase, clean, cleanCell, defaultRule, toIsoDate, toNumberText, type Options } from './data-cleaner'

const O: Options = { trim: true, collapse: true, nulls: true, dropEmpty: true, dedupe: true, keys: [], ignoreCase: true, keepLast: false }

describe('data-cleaner', () => {
  it('cases', () => {
    expect(applyCase("mary-jane o'neil", 'title')).toBe("Mary-Jane O'Neil")
    expect(applyCase('hELLO world', 'sentence')).toBe('Hello world')
  })
  it('numbers', () => {
    expect(toNumberText('$1,234.50')).toBe('1234.5')
    expect(toNumberText('1.234,5')).toBe('1234.5')
    expect(toNumberText('(12)')).toBe('-12')
    expect(toNumberText('12,5')).toBe('12.5')
    expect(toNumberText('abc')).toBe('abc')
  })
  it('dates', () => {
    expect(toIsoDate('2024/3/7')).toBe('2024-03-07')
    expect(toIsoDate('03/07/2024')).toBe('2024-03-07')
    expect(toIsoDate('03/07/2024', true)).toBe('2024-07-03')
    expect(toIsoDate('25/12/2023')).toBe('2023-12-25')
    expect(toIsoDate('7 Mar 2024')).toBe('2024-03-07')
    expect(toIsoDate('March 7, 2024')).toBe('2024-03-07')
    expect(toIsoDate('2023-02-30')).toBe('2023-02-30')
  })
  it('cells', () => {
    expect(cleanCell('  a   b ', defaultRule('x'), O)).toBe('a b')
    expect(cleanCell('N/A', { ...defaultRule('x'), fill: 'unknown' }, O)).toBe('unknown')
    expect(cleanCell('+1 (555) 010-2030', { ...defaultRule('x'), kind: 'digits' }, O)).toBe('+15550102030')
  })
  it('dedupes by key and drops empty rows', () => {
    const h = ['name', 'email']
    const rows = [['Ann', 'ANN@x.com'], ['  ', ''], ['ann ', 'ann@x.com'], ['Bob', 'b@x.com']]
    const rules = [{ ...defaultRule('name'), fill: '?' }, { ...defaultRule('email'), kind: 'email' as const }]
    const r = clean(h, rows, rules, { ...O, keys: [1] })
    expect(r.rows).toEqual([['Ann', 'ann@x.com'], ['Bob', 'b@x.com']])
    expect(r.empty).toEqual([1])
    expect(r.dups).toEqual([{ row: 2, of: 0 }])
    expect(r.changed.has('0:1')).toBe(true)
    const last = clean(h, rows, rules, { ...O, keys: [1], keepLast: true })
    expect(last.rows[0][0]).toBe('ann')
  })
})
