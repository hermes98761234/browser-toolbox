import { describe, expect, it } from 'vitest'
import { cashRound, center, columns, itemLines, lr, totals, wrap } from './thermal-receipt-formatter'

describe('thermal-receipt-formatter', () => {
  const items = [{ name: 'Flat white', qty: 2, price: 3.5 }, { name: 'Croissant', qty: 1, price: 2.75 }]
  it('computes exclusive tax', () => {
    const t = totals(items, { discountType: 'pct', discount: 10, taxRate: 20, inclusive: false, rounding: 0 })
    expect(t.subtotal).toBe(9.75)
    expect(t.discount).toBe(0.98)
    expect(t.net).toBe(8.77)
    expect(t.tax).toBe(1.75)
    expect(t.total).toBe(10.52)
  })
  it('extracts inclusive tax and rounds cash', () => {
    const t = totals(items, { discountType: 'amount', discount: 0, taxRate: 20, inclusive: true, rounding: 0.05 })
    expect(t.total).toBe(9.75)
    expect(t.tax).toBe(1.63)
    expect(t.rounded).toBe(9.75)
    expect(cashRound(10.52, 0.05)).toBe(10.5)
    expect(cashRound(10.53, 0.05)).toBe(10.55)
    expect(cashRound(10.53, 0.1)).toBe(10.5)
  })
  it('caps discounts at the subtotal', () => {
    expect(totals(items, { discountType: 'amount', discount: 50, taxRate: 0, inclusive: false, rounding: 0 }).total).toBe(0)
  })
  it('lays out fixed-width lines', () => {
    expect(columns(58, 'A')).toBe(32)
    expect(columns(80, 'B')).toBe(64)
    expect(lr('Total', '$9.75', 16)).toBe('Total      $9.75')
    expect(lr('A very long product name', '$1.00', 16)).toBe('A very lo… $1.00')
    expect(lr('x', '$1.00', 16)).toHaveLength(16)
    expect(center('HI', 8)).toBe('   HI')
    expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four'])
    expect(wrap('abcdefghijkl', 5)).toEqual(['abcde', 'fghij', 'kl'])
  })
  it('formats item lines', () => {
    expect(itemLines({ name: 'Tea', qty: 1, price: 2 }, 20, '$')).toEqual(['Tea            $2.00'])
    expect(itemLines({ name: 'Tea', qty: 3, price: 2 }, 20, '$')).toEqual(['Tea', '  3 x $2.00    $6.00'])
  })
})
