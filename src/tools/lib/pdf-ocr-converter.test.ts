import { describe, expect, it } from 'vitest'
import { flowBoxes, groupLines, lines, pageFor, placeLine, splitPages } from './pdf-ocr-converter'

describe('pdf-ocr-converter', () => {
  it('sizes image pages from DPI and fits paper', () => {
    const p = pageFor(2480, 3508, 300, 'image')
    expect(p.pw).toBeCloseTo(595.2, 1)
    expect(p.ph).toBeCloseTo(841.92, 1)
    const a = pageFor(1000, 1000, 100, 'a4')
    expect(a.pw).toBeCloseTo(595.28)
    expect(a.iw).toBeCloseTo(595.28)
    expect(a.iy).toBeCloseTo((841.89 - 595.28) / 2)
    const l = pageFor(2000, 1000, 100, 'letter')
    expect(l.pw).toBe(792) // landscape image → landscape paper
  })
  it('groups words into reading-order lines', () => {
    const g = groupLines([
      { text: 'world', x: 60, y: 10, w: 40, h: 12 },
      { text: 'Second', x: 0, y: 40, w: 50, h: 12 },
      { text: 'Hello', x: 0, y: 11, w: 45, h: 12 },
    ])
    expect(g.map((d) => d.text)).toEqual(['Hello world', 'Second'])
    expect(g[0]).toMatchObject({ x: 0, y: 10, w: 100, h: 13 })
  })
  it('flows lines and places them in PDF space', () => {
    const b = flowBoxes(2, 0.1, 4)
    expect(b[1].y).toBeCloseTo(0.3)
    const p = placeLine({ x: 0.1, y: 0.5, w: 0.5, h: 0.02 }, { x: 0, y: 0, w: 600, h: 800 }, 50)
    expect(p.x).toBeCloseTo(60)
    expect(p.size).toBeCloseTo(16 * 0.92)
    expect(p.y).toBeCloseTo(800 - 416 + p.size * 0.2)
    expect(p.squeeze).toBeCloseTo((300 / (50 * p.size)) * 100)
  })
  it('splits bulk text into pages', () => {
    expect(splitPages('a\nb\n--- page 2 ---\nc\fd')).toEqual(['a\nb', 'c', 'd'])
    expect(splitPages('one\n=====\ntwo')).toEqual(['one', 'two'])
    expect(lines('x\n\n y \n')).toEqual(['x', ' y '])
  })
})
