import { describe, expect, it } from 'vitest'
import { centroid, distToSegment, perimeter, polygonArea, snap } from './3d-floor-plan-designer'

describe('floor plan geometry', () => {
  it('areas', () => {
    expect(polygonArea([[0, 0], [4, 0], [4, 3], [0, 3]])).toBe(12)
    // L-shape: 6x4 + 7x1
    expect(polygonArea([[0, 0], [6, 0], [6, 4], [7, 4], [7, 5], [0, 5]])).toBe(31)
    expect(perimeter([[0, 0], [4, 0], [4, 3], [0, 3]])).toBe(14)
    expect(centroid([[0, 0], [4, 0], [4, 2], [0, 2]])).toEqual([2, 1])
  })
  it('distance and snapping', () => {
    expect(distToSegment(2, 1, 0, 0, 4, 0)).toBe(1)
    expect(distToSegment(6, 0, 0, 0, 4, 0)).toBe(2)
    expect(snap(1.13, 0.25)).toBe(1.25)
  })
})
