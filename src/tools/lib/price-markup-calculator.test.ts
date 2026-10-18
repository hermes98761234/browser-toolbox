import { describe, expect, it } from 'vitest'
import { batchPrice, breakdown, marginToMarkup, markupToMargin, netPrice, parseNum, roundEnding, splitCsv } from './price-markup-calculator'

describe('price markup calculator', () => {
  it('converts markup and margin', () => {
    expect(markupToMargin(1)).toBeCloseTo(0.5, 10)
    expect(markupToMargin(0.25)).toBeCloseTo(0.2, 10)
    expect(marginToMarkup(0.2)).toBeCloseTo(0.25, 10)
    expect(marginToMarkup(1)).toBeNaN()
  })
  it('computes prices from each driver', () => {
    expect(netPrice(40, 'markup', 0.5)).toBe(60)
    expect(netPrice(40, 'margin', 0.5)).toBe(80)
    expect(netPrice(40, 'price', 99)).toBe(99)
    const b = breakdown(40, 50, 0.2)
    expect(b.gross).toBe(60)
    expect(b.markup).toBeCloseTo(0.25, 10)
    expect(b.margin).toBeCloseTo(0.2, 10)
  })
  it('rounds to price endings', () => {
    expect(roundEnding(12.3, '.99', 'up')).toBe(12.99)
    expect(roundEnding(12.3, '.99', 'down')).toBe(11.99)
    expect(roundEnding(12.3, '.99', 'nearest')).toBe(11.99)
    expect(roundEnding(12.99, '.99', 'up')).toBe(12.99)
    expect(roundEnding(12.6, '.49', 'nearest')).toBe(12.49)
    expect(roundEnding(23.1, '9', 'up')).toBe(29)
    expect(roundEnding(23.1, '9', 'nearest')).toBe(19)
    expect(roundEnding(1.23, '0.05', 'up')).toBe(1.25)
    expect(roundEnding(7.2, '.00', 'down')).toBe(7)
  })
  it('parses numbers in several formats', () => {
    expect(parseNum('$1,234.50')).toBe(1234.5)
    expect(parseNum('12,5')).toBe(12.5)
    expect(parseNum('1.234,56')).toBe(1234.56)
    expect(parseNum('abc')).toBeNaN()
    expect(splitCsv('"Mug, large";3,5;40')).toEqual(['Mug, large', '3,5', '40'])
  })
  it('prices a batch with per-row overrides and rounding', () => {
    const rows = batchPrice('name,cost,markup\nMug,4,\nPlate,10,100\nBad,x', { driver: 'markup', value: 1.5, taxRate: 0, ending: '.99', dir: 'up', roundGross: false })
    expect(rows).toHaveLength(3)
    expect(rows[0].final).toBe(10.99)
    expect(rows[1].final).toBe(20.99)
    expect(rows[1].markup).toBeCloseTo(1.099, 3)
    expect(rows[2].error).toBeTruthy()
  })
})
