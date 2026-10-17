import { describe, expect, it } from 'vitest'
import { cellMatrix, density, expand, formula, neighbours, parseCif, parseOp, SAMPLES, supercell, volume } from './crystal-lattice-viewer'

describe('crystal-lattice-viewer', () => {
  it('parses symmetry operations', () => {
    expect(parseOp('-x+1/2, y, z+0.5')).toEqual([[-1, 0, 0, 0.5], [0, 1, 0, 0], [0, 0, 1, 0.5]])
    expect(parseOp('x-y,x,z+1/2')).toEqual([[1, -1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0.5]])
  })
  it('NaCl: 8 atoms, density 2.16, CN 6 at a/2', () => {
    const c = parseCif(SAMPLES['NaCl (rock salt)'])
    const at = expand(c)
    expect(at.length).toBe(8)
    expect(density(c, at)).toBeCloseTo(2.165, 2)
    expect(formula(at)).toEqual({ formula: 'ClNa', Z: 4 })
    const nb = neighbours(c, at)
    expect(nb[0].cn).toBe(6)
    expect(nb[0].d).toBeCloseTo(2.8201, 3)
  })
  it('Si diamond and uncertainty notation', () => {
    const c = parseCif(SAMPLES['Si (diamond)'])
    expect(c.a).toBe(5.431)
    const at = expand(c)
    expect(at.length).toBe(8)
    expect(density(c, at)).toBeCloseTo(2.329, 2)
    expect(neighbours(c, at)[0].cn).toBe(4)
  })
  it('hexagonal cell and wurtzite expansion', () => {
    const c = parseCif(SAMPLES['ZnO (wurtzite)'])
    expect(volume(c)).toBeCloseTo((Math.sqrt(3) / 2) * 3.2495 ** 2 * 5.2069, 4)
    const M = cellMatrix(c)
    expect(M[1][0]).toBeCloseTo(-3.2495 / 2, 6)
    const at = expand(c)
    expect(at.length).toBe(4)
    expect(density(c, at)).toBeCloseTo(5.67, 1)
  })
  it('rutile and supercell with boundary atoms', () => {
    const r = expand(parseCif(SAMPLES['TiO₂ (rutile)']))
    expect(r.length).toBe(6)
    const cu = parseCif(SAMPLES['Cu (FCC)'])
    const at = expand(cu)
    expect(at.length).toBe(4)
    expect(supercell(cu, at, [1, 1, 1], false).length).toBe(4)
    expect(supercell(cu, at, [1, 1, 1], true).length).toBe(14) // 8 corners + 6 faces
    expect(supercell(cu, at, [2, 2, 2], true).length).toBe(27 + 36) // 3³ lattice points + 36 face centres
  })
})
