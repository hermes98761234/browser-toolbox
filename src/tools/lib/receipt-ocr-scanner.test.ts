import { describe, expect, it } from 'vitest'
import { checks, findDate, parseAmount, parseReceipt, SAMPLE_TEXT } from './receipt-ocr-scanner'

describe('amounts and dates', () => {
  it('parses amounts', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56)
    expect(parseAmount('1.234,56 €')).toBe(1234.56)
    expect(parseAmount('12,50')).toBe(12.5)
    expect(parseAmount('3.00-')).toBe(-3)
    expect(parseAmount('abc')).toBeNull()
  })
  it('finds dates', () => {
    expect(findDate('2026-03-04 10:00')).toBe('2026-03-04')
    expect(findDate('04/03/2026')).toBe('2026-03-04')
    expect(findDate('04/03/2026', false)).toBe('2026-04-03')
    expect(findDate('10/14/26')).toBe('2026-10-14')
    expect(findDate('Date: Oct 5, 2026')).toBe('2026-10-05')
    expect(findDate('5 March 2026')).toBe('2026-03-05')
    expect(findDate('31/02/2026')).toBe('')
  })
})

describe('parseReceipt', () => {
  it('parses the US sample', () => {
    const p = parseReceipt(SAMPLE_TEXT)
    expect(p.merchant).toBe('GREEN LEAF MARKET')
    expect(p.date).toBe('2026-10-14')
    expect(p.time).toBe('18:42')
    expect(p.subtotal).toBe(37.58)
    expect(p.tax).toBe(1.69)
    expect(p.taxRate).toBe(4.5)
    expect(p.total).toBe(39.27)
    expect(p.payment).toBe('Visa ····4821')
    expect(p.items).toHaveLength(7)
    expect(p.items[0]).toEqual({ desc: 'Organic Bananas', qty: 2, price: 0.79, total: 1.58 })
    expect(p.items[4]).toEqual({ desc: 'Avocado', qty: 3, price: 1.25, total: 3.75 })
    expect(checks({ ...p, taxIncluded: false }).every((c) => c.ok)).toBe(true)
  })
  it('parses an EU receipt with included VAT', () => {
    const p = parseReceipt(`Bäckerei Schmidt\n17.10.2026 08:15\nCroissant 2 x 1,20 2,40\nCappuccino 3,10\nSUMME EUR 5,50\nMwSt 19% incl. 0,88\nBar 10,00\nRückgeld 4,50`)
    expect(p.currency).toBe('€')
    expect(p.date).toBe('2026-10-17')
    expect(p.total).toBe(5.5)
    expect(p.tax).toBe(0.88)
    expect(p.items.map((i) => i.total)).toEqual([2.4, 3.1])
    expect(checks({ ...p, taxIncluded: true }).every((c) => c.ok)).toBe(true)
  })
  it('flags arithmetic problems', () => {
    const c = checks({ items: [{ desc: 'a', qty: 2, price: 1, total: 2.5 }], subtotal: 2.5, tax: 0.2, tip: null, discount: null, total: 3, taxIncluded: false })
    expect(c.filter((x) => !x.ok).map((x) => x.label)).toEqual(['“a” line', 'Subtotal + tax + tip = total'])
  })
})
