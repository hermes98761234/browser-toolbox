import { describe, expect, it } from 'vitest'
import { cardSvg, esc, layoutSheet, PAGES, sheetSvg, SIZES, slots, stampGrid, wrap, type Design } from './loyalty-card-maker'

const D: Design = {
  business: 'Bean & Leaf', tagline: 'Coffee <bar>', reward: '10th coffee free', stamps: 10, icon: '☕', shape: 'circle', bg: '#fff', bg2: '#eee', accent: '#7c2d12', ink: '#111',
  font: 'sans', radius: 3, logo: '', freeLast: true, numbers: true, preview: 3, backTitle: 'Rules', terms: 'One stamp per drink.', address: '1 Main St', phone: '555', web: 'x.example', nameLine: true, expiryLine: true,
}

describe('stampGrid', () => {
  it('picks a sensible grid', () => {
    expect(stampGrid(10, 80, 30)).toMatchObject({ cols: 5, rows: 2 })
    expect(stampGrid(8, 80, 25)).toMatchObject({ cols: 4, rows: 2 })
    expect(stampGrid(12, 80, 20)).toMatchObject({ cols: 6, rows: 2 })
    const g = stampGrid(6, 60, 10)
    expect(g.rows).toBe(1)
    expect(g.d).toBeCloseTo(60 / 7.1, 6)
  })
  it('never leaves a whole empty row', () => {
    for (let n = 1; n <= 20; n++) {
      const g = stampGrid(n, 75, 30)
      expect(g.cols * g.rows).toBeGreaterThanOrEqual(n)
      expect(g.cols * g.rows - n).toBeLessThan(g.cols)
    }
  })
})

describe('sheet', () => {
  it('fits 10 US business cards on Letter with 0.5 in margins', () => {
    const s = layoutSheet(PAGES.letter.w, PAGES.letter.h, SIZES[0].w, SIZES[0].h, 12.7, 0, false)
    expect([s.cols, s.rows, s.perPage]).toEqual([2, 5, 10])
    expect(s.x0).toBeCloseTo((215.9 - 177.8) / 2, 6)
  })
  it('fits 10 EU cards on A4 and rotates when that fits more', () => {
    const s = layoutSheet(210, 297, 85, 55, 10, 0)
    expect(s.perPage).toBe(10)
    const r = layoutSheet(100, 200, 90, 50, 5, 0)
    expect(r.rotated).toBe(false)
    const r2 = layoutSheet(120, 100, 85, 55, 5, 0)
    expect(r2.perPage).toBe(2)
    expect(r2.rotated).toBe(true)
    const r3 = layoutSheet(130, 200, 85, 55, 5, 0)
    expect(r3.rotated).toBe(true)
    expect(r3.perPage).toBe(4)
  })
  it('mirrors columns for duplex backs', () => {
    const s = layoutSheet(210, 297, 85, 55, 10, 4)
    const f = slots(s), b = slots(s, true)
    expect(b[0].x).toBe(f[s.cols - 1].x)
    expect(b[0].y).toBe(f[0].y)
  })
})

describe('svg', () => {
  it('escapes text and draws the stamps', () => {
    const svg = cardSvg(D, 85, 55, 'front')
    expect(svg).toContain('Coffee &lt;bar&gt;')
    expect(svg).toContain('Bean &amp; Leaf')
    expect(svg.match(/stroke-dasharray/g)).toHaveLength(9)
    expect(svg).toContain('FREE')
    expect(svg.match(/☕/g)).toHaveLength(3)
    expect(cardSvg(D, 85, 55, 'back')).toContain('Valid until')
  })
  it('places one card per slot plus crop marks', () => {
    const s = layoutSheet(210, 297, 85, 55, 10, 0)
    const svg = sheetSvg(D, 210, 297, SIZES[1], s, 'front', true)
    expect(svg.match(/<g transform/g)).toHaveLength(10)
    expect(svg).toContain('stroke-width="0.15"')
  })
  it('wraps and escapes helpers', () => {
    expect(wrap('aa bb cc dd', 5)).toEqual(['aa bb', 'cc dd'])
    expect(esc('"<&>"')).toBe('&quot;&lt;&amp;&gt;&quot;')
  })
})
