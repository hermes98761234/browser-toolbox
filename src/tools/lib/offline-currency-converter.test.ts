import { describe, expect, it } from 'vitest'
import { ageDays, ageText, BUNDLED, convert, cross, effective, evalAmount, overrideFromCross, parseApi } from './offline-currency-converter'

describe('offline currency converter', () => {
  it('converts through EUR', () => {
    const r = { EUR: 1, USD: 1.2, GBP: 0.8 }
    expect(convert(100, 'EUR', 'USD', r)).toBeCloseTo(120, 10)
    expect(convert(120, 'USD', 'EUR', r)).toBeCloseTo(100, 10)
    expect(convert(12, 'USD', 'GBP', r)).toBeCloseTo(8, 10)
    expect(cross('GBP', 'USD', r)).toBeCloseTo(1.5, 10)
    expect(convert(1, 'USD', 'XXX', r)).toBeNaN()
  })
  it('layers fetched and manual rates over the bundle', () => {
    const e = effective({ USD: 1.1 }, { GBP: 0.9, JPY: 0 })
    expect(e.USD).toBe(1.1)
    expect(e.GBP).toBe(0.9)
    expect(e.JPY).toBe(BUNDLED.JPY)
    expect(e.EUR).toBe(1)
    // "1 USD = 40 UAH" with USD at 1.1/EUR → 44 UAH/EUR
    expect(overrideFromCross(40, 'USD', e)).toBeCloseTo(44, 10)
  })
  it('parses API responses', () => {
    const p = parseApi({ amount: 1, base: 'EUR', date: '2026-10-16', rates: { USD: 1.09, GBP: 0.85, bad: 'x' } })
    expect(p?.date).toBe('2026-10-16')
    expect(p?.rates).toEqual({ USD: 1.09, GBP: 0.85, EUR: 1 })
    const q = parseApi({ base: 'USD', date: '2026-10-16', rates: { EUR: 0.5, GBP: 0.4 } })
    expect(q?.rates.USD).toBeCloseTo(2, 10)
    expect(q?.rates.GBP).toBeCloseTo(0.8, 10)
    expect(parseApi({ message: 'not found' })).toBeNull()
  })
  it('describes age', () => {
    expect(ageDays('2026-10-01', Date.parse('2026-10-11'))).toBe(10)
    expect(ageText(0)).toBe('today')
    expect(ageText(90)).toBe('3 months ago')
  })
  it('evaluates amount expressions', () => {
    expect(evalAmount('12.5*2+5')).toBe(30)
    expect(evalAmount('(10+2)/4')).toBe(3)
    expect(evalAmount('3,5')).toBe(3.5)
    expect(evalAmount('alert(1)')).toBeNaN()
  })
})
