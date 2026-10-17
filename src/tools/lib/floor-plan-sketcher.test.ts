import { describe, expect, it } from 'vitest'
import { area, centroid, fmtArea, fmtLen, ortho, perimeter, project } from './floor-plan-sketcher'

describe('floor plan geometry', () => {
  const rect: [number, number][] = [[0, 0], [400, 0], [400, 300], [0, 300]]
  it('area and perimeter of a 4×3 m room', () => {
    expect(area(rect)).toBe(120000)
    expect(fmtArea(area(rect), 'm')).toBe('12.00 m²')
    expect(perimeter(rect)).toBe(1400)
  })
  it('L-shaped area and centroid', () => {
    const L: [number, number][] = [[0, 0], [200, 0], [200, 100], [100, 100], [100, 200], [0, 200]]
    expect(area(L)).toBe(30000)
    const [cx, cy] = centroid(rect)
    expect([cx, cy]).toEqual([200, 150])
  })
  it('imperial formatting', () => {
    expect(fmtLen(304.8, 'ft')).toBe('10′ 0″')
    expect(fmtArea(929.0304 * 100, 'ft')).toBe('100.0 ft²')
  })
  it('ortho locks to 0/45/90°', () => {
    expect(ortho([0, 0], [100, 8])).toEqual([100, 0])
    expect(ortho([0, 0], [5, -100])).toEqual([0, -100])
    const d = ortho([0, 0], [100, 95])
    expect(d[0]).toBe(d[1])
  })
  it('projects onto a segment', () => {
    const r = project([50, 30], [0, 0], [100, 0])
    expect(r.q).toEqual([50, 0])
    expect(r.d).toBe(30)
  })
})
