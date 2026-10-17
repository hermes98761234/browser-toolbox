import { describe, expect, it } from 'vitest'
import { addTax, batch, combineRates, findRate, parseLines, removeTax, round2 } from './sales-tax-calculator'

describe('sales-tax-calculator', () => {
  it('adds and removes tax', () => {
    expect(addTax(100, 8.25)).toEqual({ net: 100, tax: 8.25, gross: 108.25 })
    const r = removeTax(120, 20)
    expect(r.net).toBeCloseTo(100)
    expect(r.tax).toBeCloseTo(20)
    expect(findRate(100, 119)).toBeCloseTo(19)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(-1.005)).toBe(-1.01)
  })
  it('combines rates', () => {
    expect(combineRates([6.25, 2])).toBe(8.25)
    expect(combineRates([5, 9.975], true)).toBeCloseTo(15.47375)
  })
  it('parses batch lines', () => {
    const { lines, errors } = parseLines('Coffee; 3.50; 2\nBagel, 2.25\n$1,299.00\n# comment\nnothing here')
    expect(lines).toEqual([
      { label: 'Coffee', amount: 3.5, qty: 2 },
      { label: 'Bagel', amount: 2.25, qty: 1 },
      { label: 'Item 3', amount: 1299, qty: 1 },
    ])
    expect(errors).toHaveLength(1)
  })
  it('rounds per line or per total', () => {
    const lines = [{ label: 'a', amount: 0.99, qty: 1 }, { label: 'b', amount: 0.99, qty: 1 }, { label: 'c', amount: 0.99, qty: 1 }]
    // 7%: 0.0693 each → per line 0.07 ×3 = 0.21; on total 2.97 × 7% = 0.2079 → 0.21
    expect(batch(lines, 7, false, true).total).toEqual({ net: 2.97, tax: 0.21, gross: 3.18 })
    const l2 = [{ label: 'a', amount: 0.1, qty: 1 }, { label: 'b', amount: 0.1, qty: 1 }, { label: 'c', amount: 0.1, qty: 1 }]
    // 5%: 0.005 each → per line rounds to 0.01 ×3 = 0.03; total 0.30 × 5% = 0.015 → 0.02
    expect(batch(l2, 5, false, true).total.tax).toBe(0.03)
    expect(batch(l2, 5, false, false).total.tax).toBe(0.02)
    const inc = batch([{ label: 'x', amount: 12, qty: 1 }], 20, true, false).total
    expect(inc).toEqual({ net: 10, tax: 2, gross: 12 })
  })
})
