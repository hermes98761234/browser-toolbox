import { describe, expect, it } from 'vitest'
import { groupRings, maskToShapes, meshVolume, pointInPoly, type P } from './text-to-3d'

const sq = (x: number, y: number, s: number, ccw: boolean): P[] => {
  const r: P[] = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]
  return ccw ? r : r.reverse()
}

describe('text-to-3d', () => {
  it('point in polygon', () => {
    expect(pointInPoly([1, 1], sq(0, 0, 2, true))).toBe(true)
    expect(pointInPoly([3, 1], sq(0, 0, 2, true))).toBe(false)
  })
  it('groups holes into the smallest containing outer ring', () => {
    const g = groupRings([sq(0, 0, 10, true), sq(2, 2, 6, false), sq(4, 4, 2, true), sq(20, 0, 5, true)])
    expect(g.length).toBe(3)
    const big = g.find((s) => s.outer[0][0] === 0 && s.outer.length === 4 && s.holes.length === 1)
    expect(big).toBeTruthy()
    expect(g.filter((s) => s.holes.length === 0).length).toBe(2)
  })
  it('traces a ring-shaped mask into one shape with one hole', () => {
    const w = 30, h = 30
    const m = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - 15, y - 15)
      m[y * w + x] = d < 12 && d > 6 ? 1 : 0
    }
    const s = maskToShapes(m, w, h)
    expect(s.length).toBe(1)
    expect(s[0].holes.length).toBe(1)
  })
  it('computes the volume of a unit cube', () => {
    const v = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
    ]
    const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
    expect(meshVolume(f.flatMap((t) => t.flatMap((i) => v[i])))).toBeCloseTo(1, 10)
  })
})
