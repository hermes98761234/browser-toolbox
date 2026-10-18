import { describe, expect, it } from 'vitest'
import { autoSym, fitSheet, parseProducts, unitPrice } from './shelf-label-printer'

describe('shelf-label-printer', () => {
  it('computes unit prices', () => {
    expect(unitPrice(2.49, 500, 'g', 'metric1').value).toBeCloseTo(4.98, 10)
    expect(unitPrice(2.49, 500, 'g', 'metric100').value).toBeCloseTo(0.498, 10)
    expect(unitPrice(1.99, 1.5, 'l', 'metric1')).toEqual({ value: 1.99 / 1.5, per: 'per L' })
    expect(unitPrice(3.2, 16, 'oz', 'us').value).toBeCloseTo(0.2, 10)
    expect(unitPrice(3.2, 1, 'lb', 'us').value).toBeCloseTo(0.2, 10)
    expect(unitPrice(4.5, 12, 'ct', 'us')).toEqual({ value: 0.375, per: 'each' })
    expect(unitPrice(1, 0, 'g', 'us').value).toBeNaN()
  })
  it('chooses symbologies', () => {
    expect(autoSym('4006381333931')).toBe('ean13')
    expect(autoSym('036000291452')).toBe('upca')
    expect(autoSym('SKU-12')).toBe('code128')
    expect(autoSym('')).toBeNull()
  })
  it('parses product CSV and fits sheets', () => {
    let i = 0
    const p = parseProducts('Product,Price,Size,Barcode\nOat milk,1.89,1 L,4006381333931\nRice,"2,49",500 g,\n', () => String(i++))
    expect(p.length).toBe(2)
    expect(p[0]).toMatchObject({ name: 'Oat milk', price: 1.89, size: 1, unit: 'l', barcode: '4006381333931' })
    expect(p[1]).toMatchObject({ price: 2.49, size: 500, unit: 'g' })
    expect(fitSheet(210, 297, 8, 2, 50, 30, 30)).toEqual({ cols: 3, rows: 8, perPage: 24, pages: 2 })
  })
})
