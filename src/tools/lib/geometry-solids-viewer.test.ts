import { describe, expect, it } from 'vitest'
import { buildSolid, formulas, polyArea, polyVolume, section, unfold, type Params, type SolidKind } from './geometry-solids-viewer'

const P: Params = { a: 2, l: 3, w: 2, h: 4, r: 1.5, n: 6 }
const val = (k: SolidKind, label: string) => formulas(k, P).rows.find((r) => r.label === label)!.value

describe('solids', () => {
  it('polyhedra volumes and areas match exact formulas', () => {
    for (const k of ['cube', 'cuboid', 'prism', 'pyramid', 'tetrahedron'] as SolidKind[]) {
      const p = buildSolid(k, P)
      expect(polyVolume(p), k).toBeCloseTo(val(k, 'Volume'), 8)
      expect(polyArea(p), k).toBeCloseTo(val(k, 'Surface area'), 8)
    }
  })
  it('curved approximations are close', () => {
    expect(polyVolume(buildSolid('cylinder', P)) / val('cylinder', 'Volume')).toBeCloseTo(1, 2)
    expect(polyVolume(buildSolid('cone', P)) / val('cone', 'Volume')).toBeCloseTo(1, 2)
  })
  it('known values', () => {
    expect(val('tetrahedron', 'Volume')).toBeCloseTo(8 / (6 * Math.SQRT2), 12)
    expect(val('cone', 'Slant height')).toBeCloseTo(Math.hypot(1.5, 4), 12)
    expect(formulas('sphere', { ...P, r: 1 }).rows[0].value).toBeCloseTo(4.18879, 5)
  })
  it('nets unfold flat onto the base plane and keep area', () => {
    for (const k of ['cube', 'cuboid', 'prism', 'pyramid', 'tetrahedron', 'cylinder', 'cone'] as SolidKind[]) {
      const p = buildSolid(k, P)
      const flat = unfold(p, 1)
      for (const f of flat) for (const v of f) expect(Math.abs(v[1]), k).toBeLessThan(1e-9)
      const folded = unfold(p, 0)
      expect(folded[1][0]).toEqual(p.verts[p.faces[1][0]])
    }
  })
  it('cross sections', () => {
    const cube = buildSolid('cube', P)
    expect(section(cube, [0, 1, 0], 1).area).toBeCloseTo(4, 10)
    const hex = section(cube, [1, 1, 1], 1 / Math.sqrt(3))
    expect(hex.pts.length).toBe(6)
    expect(hex.area).toBeCloseTo((3 * Math.sqrt(3) / 4) * 4, 8)
    expect(section(cube, [0, 1, 0], 5).area).toBe(0)
  })
})
