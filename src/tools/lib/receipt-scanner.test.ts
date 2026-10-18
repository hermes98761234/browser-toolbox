import { describe, expect, it } from 'vitest'
import { cleanPixels, extract, guessCategory, summarize, type Expense } from './receipt-scanner'

const TEXT = `GREENLEAF MARKET
12 Orchard Road
Date: 14/10/2026 17:42
Oat milk 1L        1.89
Bananas 1.2kg      2.15
Sourdough loaf     3.40
SUBTOTAL           7.44
VAT 5%             0.37
TOTAL              7.81
VISA **** 4821`

describe('receipt-scanner', () => {
  it('extracts merchant, date, total and category', () => {
    const e = extract(TEXT)
    expect(e.merchant).toBe('GREENLEAF MARKET')
    expect(e.date).toBe('2026-10-14')
    expect(e.total).toBe(7.81)
    expect(e.how.total).toBe('label')
    expect(e.category).toBe('Groceries')
    expect(e.payment).toContain('Visa')
  })
  it('falls back to the largest amount without a TOTAL line', () => {
    const e = extract('Corner Cafe\nLatte 3.20\nCroissant 2.60\n5.80')
    expect(e.total).toBe(5.8)
    expect(e.how.total).toBe('guess')
    expect(guessCategory('Shell fuel station')).toBe('Fuel & transport')
  })
  it('cleans pixels to black and white', () => {
    const d = new Uint8ClampedArray([250, 250, 250, 255, 20, 20, 20, 255, 240, 240, 240, 255, 30, 30, 30, 255])
    cleanPixels(d, null, 'bw', 1.2)
    expect([d[0], d[4], d[8], d[12]]).toEqual([255, 0, 255, 0])
  })
  it('summarizes expenses', () => {
    const mk = (date: string, category: Expense['category'], total: number): Expense => ({ id: date + total, date, merchant: '', category, total, tax: 0, currency: '$', payment: '', note: '', text: '', thumb: '', created: 0 })
    const s = summarize([mk('2026-09-03', 'Dining', 10), mk('2026-10-01', 'Dining', 5.5), mk('2026-10-02', 'Groceries', 20)])
    expect(s.total).toBe(35.5)
    expect(s.months).toEqual([['2026-09', 10], ['2026-10', 25.5]])
    expect(s.cats[0]).toEqual(['Groceries', 20])
  })
})
