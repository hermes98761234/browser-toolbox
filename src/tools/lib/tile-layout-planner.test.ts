import { describe, expect, it } from 'vitest'
import { clipRect, groutKg, layout, patternCells, polyArea, roomShape, type Pattern } from './tile-layout-planner'

describe('tile-layout-planner', () => {
  it('clips polygons to rectangles', () => {
    const sq: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    expect(polyArea(clipRect(sq, { x0: 0, z0: 0, x1: 5, z1: 5 }))).toBeCloseTo(1, 9)
    expect(clipRect(sq, { x0: 2, z0: 2, x1: 3, z1: 3 })).toHaveLength(0)
  })
  it('builds an L-shaped room', () => {
    const r = roomShape(4, 3, 1, 1)
    expect(r.rects.reduce((a, x) => a + (x.x1 - x.x0) * (x.z1 - x.z0), 0)).toBeCloseTo(11, 9)
    expect(polyArea(r.outline)).toBeCloseTo(11, 9)
  })
  it('counts an exact fit with no cuts', () => {
    const r = layout({ W: 3, L: 2, notchW: 0, notchL: 0, tw: 0.5, th: 0.5, grout: 0, pattern: 'straight', start: 'corner' })
    expect(r.full).toBe(24)
    expect(r.cut).toBe(0)
  })
  it('counts cuts when the tiles do not fit', () => {
    const r = layout({ W: 1.05, L: 1, notchW: 0, notchL: 0, tw: 0.5, th: 0.5, grout: 0, pattern: 'straight', start: 'corner' })
    expect(r.full).toBe(4)
    expect(r.cut).toBe(2)
    expect(r.slivers).toBe(2) // 5 cm strips are 10 % of a tile
  })
  it('covers the room area exactly for every pattern without grout', () => {
    for (const p of ['straight', 'brick2', 'brick3', 'diagonal', 'herring', 'herring45'] as Pattern[]) {
      const r = layout({ W: 2.3, L: 1.7, notchW: 0.6, notchL: 0.5, tw: 0.3, th: 0.15, grout: 0, pattern: p, start: 'center' })
      const covered = r.pieces.reduce((a, t) => a + t.parts.reduce((b, q) => b + polyArea(q), 0), 0)
      expect(covered, p).toBeCloseTo(r.area, 4)
    }
  })
  it('herringbone cells do not overlap', () => {
    const cells = patternCells('herring', 0.2, 0.1, 0, 1)
    const total = cells.filter((c) => c.x0 >= -0.5 && c.x1 <= 0.5 && c.z0 >= -0.5 && c.z1 <= 0.5).length
    expect(total).toBeGreaterThan(10)
    for (let k = 0; k < 400; k++) {
      const x = Math.sin(k * 12.9898) * 0.5 + 0.0123, z = Math.cos(k * 78.233) * 0.5 + 0.0071
      const n = cells.filter((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1).length
      expect(n).toBeLessThanOrEqual(1)
      expect(n).toBe(1)
    }
  })
  it('estimates grout', () => {
    // 300×300 tile, 3 mm joint, 8 mm deep, 10 m² → (600/90000)·3·8·1.6·10 = 2.56 kg
    expect(groutKg(300, 300, 3, 8, 10)).toBeCloseTo(2.56, 6)
  })
})
