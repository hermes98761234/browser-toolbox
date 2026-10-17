import { describe, expect, it } from 'vitest'
import { angles, area, centroid, parseWalk, perimeter, selfIntersects, toM2 } from './room-area-calculator'

describe('room area', () => {
  const L: [number, number][] = [[0, 0], [4, 0], [4, 3], [2, 3], [2, 5], [0, 5]]
  it('shoelace on an L-shape', () => {
    expect(area(L)).toBeCloseTo(4 * 3 + 2 * 2, 10)
    expect(perimeter(L)).toBeCloseTo(18, 10)
    expect(angles(L).reduce((a, b) => a + b, 0)).toBeCloseTo(720, 6)
    expect(angles(L)[3]).toBeCloseTo(270, 6)
  })
  it('centroid of a rectangle', () => {
    expect(centroid([[0, 0], [4, 0], [4, 2], [0, 2]])).toEqual([2, 1])
  })
  it('detects bow-ties', () => {
    expect(selfIntersects([[0, 0], [2, 2], [2, 0], [0, 2]])).toBe(true)
    expect(selfIntersects(L)).toBe(false)
  })
  it('walks walls', () => {
    const w = parseWalk('E4, N3, W2, N2, W2, S5')
    expect(w.gap).toBeCloseTo(0)
    expect(w.pts).toHaveLength(6)
    expect(area(w.pts)).toBeCloseTo(16)
    expect(parseWalk('E 4, X 2').error).toBeTruthy()
    expect(parseWalk('E4, 90@3').pts[2]).toEqual([4, 3])
  })
  it('converts', () => {
    expect(toM2(100, 'ft')).toBeCloseTo(9.290304, 6)
  })
})
