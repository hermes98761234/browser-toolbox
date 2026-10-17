import { describe, expect, it } from 'vitest'
import { arcPath, detectDelimiter, niceScale, parseCsv, short, toNumber, toTable } from './chart-builder'

describe('chart-builder', () => {
  it('parses CSV with quotes and delimiters', () => {
    expect(parseCsv('a,b\n"x, y",2\r\n"say ""hi""",3\n')).toEqual([['a', 'b'], ['x, y', '2'], ['say "hi"', '3']])
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
  })
  it('cleans numbers', () => {
    expect(toNumber('$1,234.50')).toBe(1234.5)
    expect(toNumber('12%')).toBe(12)
    expect(toNumber('(30)')).toBe(-30)
    expect(toNumber('1.234,5')).toBe(1234.5)
    expect(toNumber('3,5')).toBe(3.5)
    expect(toNumber('abc')).toBeNaN()
  })
  it('builds a typed table', () => {
    const t = toTable([['Month', 'Sales'], ['Jan', '10'], ['Feb', '']])
    expect(t.numeric).toEqual([false, true])
    expect(t.rows[1]).toEqual(['Feb', ''])
  })
  it('scales axes', () => {
    expect(niceScale(0, 87)).toEqual({ min: 0, max: 100, ticks: [0, 20, 40, 60, 80, 100] })
    expect(niceScale(-3, 7).ticks).toEqual([-4, -2, 0, 2, 4, 6, 8])
    expect(niceScale(5, 5).max).toBeGreaterThan(5)
  })
  it('draws arcs and short labels', () => {
    expect(arcPath(0, 0, 10, 0, 0, Math.PI / 2)).toBe('M0 0L0.00 -10.00A10 10 0 0 1 10.00 0.00Z')
    expect(short(1500)).toBe('1500')
    expect(short(25000)).toBe('25k')
    expect(short(2_000_000)).toBe('2M')
  })
})
