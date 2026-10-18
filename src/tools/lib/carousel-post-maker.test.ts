import { describe, expect, it } from 'vitest'
import { bounds, crossings, hit, seams, snap, targets, tileName, tilesOf, wrapText } from './carousel-post-maker'

describe('geometry', () => {
  it('seams and crossings', () => {
    expect(seams(3, 1080)).toEqual([1080, 2160])
    expect(crossings({ x: 1000, y: 0, w: 200, h: 50, rot: 0 }, 3, 1080)).toEqual([1080])
    expect(crossings({ x: 0, y: 0, w: 1080, h: 50, rot: 0 }, 3, 1080)).toEqual([])
    expect(tilesOf({ x: 1000, y: 0, w: 1300, h: 50, rot: 0 }, 3, 1080)).toEqual([0, 1, 2])
  })
  it('rotated bounds and hits', () => {
    const b = bounds({ x: 0, y: 0, w: 100, h: 100, rot: 45 })
    expect(b.x1 - b.x0).toBeCloseTo(Math.SQRT2 * 100)
    const r = { x: 0, y: 40, w: 100, h: 20, rot: 90 }
    expect(hit(r, 50, 5)).toBe(true)
    expect(hit(r, 5, 50)).toBe(false)
  })
  it('snap', () => {
    const t = targets(2, 1080, 1080, 60)
    const s = snap(1083, 500, 100, 100, t.tx, t.ty, 8)
    expect(s.x).toBe(1080)
    expect(s.gx).toBe(1080)
    const c = snap(486, 300, 100, 100, t.tx, t.ty, 8) // centre 536 → 540
    expect(c.x).toBe(490)
    expect(c.gy).toBeNull()
  })
  it('names and wrap', () => {
    expect(tileName('My post', 2, 7)).toBe('My-post-03-of-07.png')
    expect(tileName('', 9, 12)).toBe('slide-10-of-12.png')
    expect(wrapText('aa bb cc\n\ndd', 50, (s) => s.length * 10)).toEqual(['aa bb', 'cc', '', 'dd'])
  })
})
