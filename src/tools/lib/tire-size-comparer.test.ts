import { describe, expect, it } from 'vitest'
import { compare, loadKg, parseTire, plusSizes, rimRange } from './tire-size-comparer'

describe('tire-size-comparer', () => {
  it('parses metric codes', () => {
    const t = parseTire('225/45R17 94W')!
    expect(t.width).toBe(225)
    expect(t.sidewall).toBeCloseTo(101.25)
    expect(t.diameter).toBeCloseTo(17 * 25.4 + 202.5) // 634.3 mm
    expect(t.load).toBe(94)
    expect(t.speed).toBe('W')
    expect(t.revsPerKm).toBeCloseTo(1e6 / (Math.PI * 634.3), 1)
    expect(parseTire('P215/65R16')!.prefix).toBe('P')
    expect(parseTire('LT265/75R16 123/120S')!.load).toBe(123)
    expect(parseTire('245/40ZR18')!.rim).toBe(18)
    expect(parseTire('hello')).toBeNull()
  })
  it('parses flotation sizes', () => {
    const t = parseTire('33x12.50R15')!
    expect(t.diameter).toBeCloseTo(33 * 25.4)
    expect(t.width).toBeCloseTo(317.5)
    expect(t.sidewall).toBeCloseTo(9 * 25.4)
  })
  it('computes speedometer error', () => {
    const a = parseTire('205/55R16')!, b = parseTire('225/45R17')!
    const c = compare(a, b)
    expect(a.diameter).toBeCloseTo(631.9)
    expect(c.diaPct).toBeCloseTo((634.3 / 631.9 - 1) * 100, 3)
    expect(c.actual(100)).toBeCloseTo(100.38, 2)
  })
  it('suggests plus sizes and tables', () => {
    const a = parseTire('205/55R16')!
    const p = plusSizes(a)
    expect(p.map((x) => x.code)).toContain('225/45R17')
    expect(p.every((x) => Math.abs(x.diff) <= 1.5)).toBe(true)
    expect(loadKg(94)).toBe(670)
    expect(loadKg(200)).toBeNaN()
    expect(rimRange(225)).toEqual([6.5, 8.5])
  })
})
