import { describe, expect, it } from 'vitest'
import { cellRects, coverCrop, gridAreas, hitCell, parseAreas, TEMPLATES } from './collage-maker'

describe('parseAreas', () => {
  it('parses spans', () => {
    const l = parseAreas('aab/aac')!
    expect(l.rows).toBe(2)
    expect(l.cols).toBe(3)
    expect(l.cells).toEqual([
      { name: 'a', r0: 0, c0: 0, r1: 1, c1: 1 },
      { name: 'b', r0: 0, c0: 2, r1: 0, c1: 2 },
      { name: 'c', r0: 1, c0: 2, r1: 1, c1: 2 },
    ])
  })
  it('rejects non-rectangles and ragged rows', () => {
    expect(parseAreas('ab/ba')).toBeNull()
    expect(parseAreas('aab/ac')).toBeNull()
    expect(parseAreas('')).toBeNull()
  })
  it('all built-in templates are valid', () => {
    for (const [, t] of TEMPLATES) expect(parseAreas(t), t).not.toBeNull()
  })
  it('grid helper', () => {
    expect(gridAreas(2, 3)).toBe('abc/def')
    expect(parseAreas(gridAreas(4, 4))!.cells).toHaveLength(16)
  })
})

describe('cellRects', () => {
  it('respects gaps and margins', () => {
    const r = cellRects(parseAreas('aab/aac')!, 1000, 500, 10, 20)
    // inner width 1000-40-20 = 940 → col 313.33; inner height 500-40-10 = 450 → row 225
    expect(r[0].x).toBe(20)
    expect(r[0].w).toBeCloseTo(2 * 313.333 + 10, 2)
    expect(r[0].h).toBeCloseTo(460)
    expect(r[1].x).toBeCloseTo(20 + 2 * 323.333, 2)
    expect(r[2].y).toBeCloseTo(20 + 235)
    expect(r[2].x + r[2].w).toBeCloseTo(980)
  })
})

describe('coverCrop', () => {
  it('crops a wide image to a square cell, centred', () => {
    expect(coverCrop(400, 200, 100, 100)).toEqual({ sx: 100, sy: 0, sw: 200, sh: 200 })
  })
  it('pans and zooms', () => {
    expect(coverCrop(400, 200, 100, 100, 1, -1, 0).sx).toBe(0)
    expect(coverCrop(400, 200, 100, 100, 1, 1, 0).sx).toBe(200)
    const z = coverCrop(400, 200, 100, 100, 2)
    expect(z.sw).toBe(100)
    expect(z.sx).toBe(150)
    expect(z.sy).toBe(50)
  })
  it('hitCell', () => {
    const r = cellRects(parseAreas('ab')!, 200, 100, 0, 0)
    expect(hitCell(r, 150, 50)).toBe(1)
    expect(hitCell(r, 500, 50)).toBe(-1)
  })
})
