import { describe, expect, it } from 'vitest'
import { decayFor, detectStars, gapSegments, lightenInto, matchStars, stampSegment, type Star } from './star-trail-stacker'

function frame(w: number, h: number, stars: [number, number][]) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) d.set([10, 10, 12, 255], i * 4)
  for (const [x, y] of stars) d.set([250, 250, 250, 255], (y * w + x) * 4)
  return d
}
const st = (x: number, y: number): Star => ({ x, y, v: 200, r: 1, c: [200, 200, 200] })

describe('star trail stacker', () => {
  it('detects isolated bright points', () => {
    const s = detectStars(frame(40, 30, [[10, 10], [30, 20]]), 40, 30)
    expect(s.map((p) => [p.x, p.y]).sort()).toEqual([[10, 10], [30, 20]])
  })
  it('matches mutual nearest neighbours only', () => {
    const a = [st(10, 10), st(50, 50)]
    const b = [st(12, 11), st(90, 90)]
    expect(matchStars(a, b, 5)).toEqual([[0, 0]])
  })
  it('gap segments scale to full resolution', () => {
    const seg = gapSegments([st(10, 10)], [st(13, 14)], 10, 2)
    expect(seg[0]).toMatchObject({ x0: 20, y0: 20, x1: 26, y1: 28, w: 2 })
  })
  it('lighten keeps the max and comet decay fades old values', () => {
    const acc = new Uint8ClampedArray([100, 50, 0, 255])
    lightenInto(acc, [80, 90, 10, 255])
    expect([...acc]).toEqual([100, 90, 10, 255])
    lightenInto(acc, [0, 0, 0, 255], 0.5)
    expect([...acc]).toEqual([50, 45, 5, 255])
    expect(decayFor(11, 0.1) ** 10).toBeCloseTo(0.1, 6)
    expect(decayFor(5, 1)).toBe(1)
  })
  it('stamps a segment only inside its strip', () => {
    const w = 20, acc = new Uint8ClampedArray(w * 5 * 4)
    stampSegment(acc, w, 10, 5, { x0: 2, y0: 12, x1: 17, y1: 12, w: 1, c: [255, 0, 0] })
    expect(acc[((12 - 10) * w + 9) * 4]).toBe(255)
    expect(acc[((14 - 10) * w + 9) * 4]).toBe(0)
  })
})
