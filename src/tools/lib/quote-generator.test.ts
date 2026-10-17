import { describe, expect, it } from 'vitest'
import { addDays, calcQuote, lineAmount, wrapText, type QuoteItem } from './quote-generator'

const it1: QuoteItem = { desc: 'A', qty: 2, price: 100, disc: 10, taxable: true }
const it2: QuoteItem = { desc: 'B', qty: 1, price: 50, disc: 0, taxable: false }

describe('quote math', () => {
  it('line amount with discount', () => expect(lineAmount(it1)).toBe(180))
  it('totals with percent discount and partial tax', () => {
    const t = calcQuote([it1, it2], { discountType: 'pct', discount: 10, taxRate: 20, shipping: 15 })
    expect(t.subtotal).toBe(230)
    expect(t.lineSavings).toBe(20)
    expect(t.discount).toBe(23)
    expect(t.taxable).toBe(162) // 180 × 0.9
    expect(t.tax).toBe(32.4)
    expect(t.total).toBe(254.4) // 230 − 23 + 32.4 + 15
  })
  it('fixed discount is capped at subtotal', () => {
    const t = calcQuote([it2], { discountType: 'fixed', discount: 80, taxRate: 0, shipping: 0 })
    expect(t.discount).toBe(50)
    expect(t.total).toBe(0)
  })
  it('rounds cents', () => {
    expect(lineAmount({ desc: '', qty: 3, price: 0.1, disc: 0, taxable: true })).toBe(0.3)
  })
})

describe('helpers', () => {
  it('addDays', () => expect(addDays('2026-01-30', 30)).toBe('2026-03-01'))
  it('wrapText', () => expect(wrapText('aa bb cc', 5, (s) => s.length)).toEqual(['aa bb', 'cc']))
})
