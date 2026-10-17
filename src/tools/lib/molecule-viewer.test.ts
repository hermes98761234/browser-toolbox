import { describe, expect, it } from 'vitest'
import { angle, benzeneSdf, caffeineSdf, demoPeptidePdb, dihedral, dist, formula, inferBonds, parseAny, parseXyz } from './molecule-viewer'

describe('molecule parsing', () => {
  it('caffeine SDF', () => {
    const m = parseAny(caffeineSdf(), 'caffeine.sdf')
    const f = formula(m.atoms)
    expect(f.text).toBe('C8H10N4O2')
    expect(f.mass).toBeCloseTo(194.19, 1)
    expect(m.bonds.length).toBe(25)
    // perceived bonds from geometry agree with the explicit bond table
    expect(inferBonds(m.atoms).length).toBe(25)
  })
  it('benzene', () => {
    const m = parseAny(benzeneSdf())
    expect(formula(m.atoms).text).toBe('C6H6')
    expect(m.bonds.filter((b) => b.order === 2).length).toBe(3)
  })
  it('peptide PDB from ideal geometry', () => {
    const m = parseAny(demoPeptidePdb(), 'demo.pdb')
    const ca = m.atoms.filter((a) => a.name === 'CA')
    expect(ca.length).toBe(32)
    const n0 = m.atoms[0], ca0 = m.atoms[1]
    expect(n0.el).toBe('N')
    expect(dist([n0.x, n0.y, n0.z], [ca0.x, ca0.y, ca0.z])).toBeCloseTo(1.458, 3)
    // alpha helix: CA(i)–CA(i+3) ≈ 5.0–5.4 Å
    const d3 = dist([ca[3].x, ca[3].y, ca[3].z], [ca[6].x, ca[6].y, ca[6].z])
    expect(d3).toBeGreaterThan(4.8)
    expect(d3).toBeLessThan(5.6)
    // every residue: N, CA, C, O (+CB) — bonds = atoms − 1 for a linear tree
    expect(m.bonds.length).toBe(m.atoms.length - 1)
  })
  it('geometry helpers and xyz', () => {
    expect(angle([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(90)
    expect(dihedral([1, 0, 0], [0, 0, 0], [0, 1, 0], [0, 1, 1])).toBeCloseTo(-90)
    const w = parseXyz('3\nwater\nO 0 0 0\nH 0.757 0.586 0\nH -0.757 0.586 0')
    expect(w.bonds.length).toBe(2)
    expect(formula(w.atoms).text).toBe('H2O')
  })
})
