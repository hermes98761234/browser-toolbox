import { describe, expect, it } from 'vitest'
import { corners, fits, inside, isSimple, overlaps, pieceGap, polygonArea, PRESETS, signedArea, wallClearance, walls, type Piece } from './room-planner'

const P = (x: number, z: number, w = 1, d = 1, rot = 0, h = 0.8): Piece => ({ id: `${x}${z}`, name: 'p', w, d, h, x, z, rot, color: '#000' })

describe('room planner geometry', () => {
  it('areas of presets', () => {
    expect(polygonArea(PRESETS.rect.pts)).toBeCloseTo(20)
    expect(polygonArea(PRESETS.l.pts)).toBeCloseTo(6 * 2.8 + 3.2 * 2.2)
    expect(signedArea(PRESETS.rect.pts)).toBeGreaterThan(0)
    expect(Object.values(PRESETS).every((p) => isSimple(p.pts))).toBe(true)
  })
  it('point in polygon and fit in L-room', () => {
    const L = PRESETS.l.pts
    expect(inside(1, 1, L)).toBe(true)
    expect(inside(5, 4, L)).toBe(false)
    expect(fits(P(1, 1), L)).toBe(true)
    expect(fits(P(3.5, 3, 1, 1), L)).toBe(false) // straddles the inner corner
    expect(fits(P(0.5, 0.5), L)).toBe(true) // touching walls is fine
  })
  it('rotated corners', () => {
    const c = corners(P(2, 2, 2, 1, 90))
    const xs = c.map((p) => p[0]), zs = c.map((p) => p[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1)
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2)
  })
  it('clearance to nearest wall', () => {
    const r = wallClearance(P(1, 2), PRESETS.rect.pts)
    expect(r.dist).toBeCloseTo(0.5)
    expect(r.wall).toBe(3)
  })
  it('gaps and overlaps', () => {
    expect(pieceGap(P(1, 1), P(3, 1))).toBeCloseTo(1)
    expect(pieceGap(P(1, 1), P(1.5, 1))).toBe(0)
    expect(overlaps([P(1, 1), P(1.5, 1)])).toHaveLength(1)
    expect(overlaps([P(1, 1), P(2, 1)])).toHaveLength(0) // touching only
    expect(overlaps([P(1, 1), P(1.5, 1, 1, 1, 0, 0.01)])).toHaveLength(0) // rug
  })
  it('walls point outward', () => {
    const w = walls(PRESETS.rect.pts)
    expect(w[0].len).toBe(5)
    expect(w[0].n[1]).toBeCloseTo(-1)
    const rev = walls([...PRESETS.rect.pts].reverse())
    expect(rev[0].n[1]).toBeCloseTo(1) // edge (0,4)->(5,4) faces +z
  })
})
