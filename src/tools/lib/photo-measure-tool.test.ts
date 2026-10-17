import { describe, expect, it } from 'vitest'
import { apply, area, convexQuad, dist, homography, orderQuad, solve, type P } from './photo-measure-tool'

describe('photo-measure-tool', () => {
  it('solves linear systems', () => {
    expect(solve([[2, 1], [1, 3]], [3, 5])!.map((v) => +v.toFixed(9))).toEqual([0.8, 1.4])
    expect(solve([[1, 2], [2, 4]], [1, 2])).toBeNull()
  })
  it('recovers a known homography', () => {
    const Ht = [1.2, 0.1, 30, -0.05, 0.9, 12, 0.0004, -0.0002, 1]
    const src: P[] = [[0, 0], [400, 0], [400, 300], [0, 300]]
    const map = (p: P): P => { const w = Ht[6] * p[0] + Ht[7] * p[1] + 1; return [(Ht[0] * p[0] + Ht[1] * p[1] + Ht[2]) / w, (Ht[3] * p[0] + Ht[4] * p[1] + Ht[5]) / w] }
    const h = homography(src, src.map(map))!
    for (let i = 0; i < 9; i++) expect(h[i]).toBeCloseTo(Ht[i], 8)
    const q = apply(h, [123, 77]), r = map([123, 77])
    expect(q[0]).toBeCloseTo(r[0], 8)
    expect(q[1]).toBeCloseTo(r[1], 8)
  })
  it('maps an image quad to a rectangle', () => {
    const img: P[] = [[100, 120], [520, 90], [560, 400], [80, 380]]
    const rect: P[] = [[0, 0], [297, 0], [297, 210], [0, 210]]
    const h = homography(img, rect)!
    expect(dist(apply(h, img[0]), apply(h, img[1]))).toBeCloseTo(297, 6)
    expect(dist(apply(h, img[1]), apply(h, img[2]))).toBeCloseTo(210, 6)
    expect(area(img.map((p) => apply(h, p)))).toBeCloseTo(297 * 210, 4)
  })
  it('geometry helpers', () => {
    expect(area([[0, 0], [4, 0], [4, 3], [0, 3]])).toBe(12)
    expect(convexQuad([[0, 0], [4, 0], [4, 3], [0, 3]])).toBe(true)
    expect(convexQuad([[0, 0], [4, 0], [1, 1], [0, 3]])).toBe(false)
    expect(orderQuad([[4, 3], [0, 0], [0, 3], [4, 0]])).toEqual([[0, 0], [4, 0], [4, 3], [0, 3]])
  })
})
