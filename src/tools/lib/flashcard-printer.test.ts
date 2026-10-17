import { describe, expect, it } from 'vitest'
import { backSlot, fitFont, grid, paginate, parseCards } from './flashcard-printer'

describe('flashcard printer', () => {
  it('parses mixed separators and skips a header', () => {
    expect(parseCards('Term\tDefinition\nhola\thello\nadiós\tgoodbye')).toEqual([{ front: 'hola', back: 'hello' }, { front: 'adiós', back: 'goodbye' }])
    expect(parseCards('H2O - water\nNaCl = salt, table salt\nCO2: gas')).toEqual([
      { front: 'H2O', back: 'water' },
      { front: 'NaCl', back: 'salt, table salt' },
      { front: 'CO2', back: 'gas' },
    ])
    expect(parseCards('"a, b","line1\nline2"\nc,d')).toEqual([{ front: 'a, b', back: 'line1\nline2' }, { front: 'c', back: 'd' }])
    expect(parseCards('  ')).toEqual([])
  })
  it('fits a centred grid', () => {
    const g = grid(210, 297, 85, 55, 10, 0)
    expect([g.cols, g.rows]).toEqual([2, 5])
    expect(g.x0).toBeCloseTo(20)
    expect(g.y0).toBeCloseTo(11)
    expect(grid(210, 297, 300, 55, 10, 0).perPage).toBe(0)
  })
  it('mirrors backs for long- and short-edge duplex', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => backSlot(i, 2, 3, 'long'))).toEqual([1, 0, 3, 2, 5, 4])
    expect([0, 1, 2, 3, 4, 5].map((i) => backSlot(i, 2, 3, 'short'))).toEqual([4, 5, 2, 3, 0, 1])
    const pages = paginate([1, 2, 3], { cols: 2, rows: 1, perPage: 2, x0: 0, y0: 0, cw: 1, ch: 1, gap: 0 }, 'long')
    expect(pages).toEqual([{ fronts: [1, 2], backs: [2, 1] }, { fronts: [3, null], backs: [null, 3] }])
  })
  it('shrinks fonts for long text', () => {
    expect(fitFont('cat', 85, 55, 28)).toBe(28)
    expect(fitFont('x'.repeat(400), 85, 55, 28)).toBeLessThan(12)
    expect(fitFont('Pneumonoultramicroscopicsilicovolcanoconiosis', 63, 88, 28)).toBeLessThan(10)
  })
})
