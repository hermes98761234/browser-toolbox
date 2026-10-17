import { describe, expect, it } from 'vitest'
import { demoProteinPdb, fasta, parseProtein, parseSSRecords, seqMass, sequenceOf } from './protein-structure-viewer'
import { dist } from './molecule-viewer'

describe('protein structure', () => {
  it('parses HELIX/SHEET records at the right columns', () => {
    const r = parseSSRecords([
      'HELIX    1   1 GLU A   20  ALA A   33  1                                  14',
      'SHEET    1   S 3 LYS B   1  VAL B   6  0',
    ].join('\n'))
    expect(r).toEqual([{ type: 'H', chain: 'A', start: 20, end: 33 }, { type: 'E', chain: 'B', start: 1, end: 6 }])
  })
  it('builds the demo protein with chains, residues and secondary structure', () => {
    const p = parseProtein(demoProteinPdb())
    expect(p.chains).toEqual(['A', 'B'])
    expect(sequenceOf(p, 'A')).toHaveLength(41)
    expect(sequenceOf(p, 'B')).toHaveLength(35)
    expect(p.ssSource).toBe('records')
    expect(p.elements.filter((e) => e.type === 'E')).toHaveLength(3)
    expect(p.elements.filter((e) => e.type === 'H')).toHaveLength(3)
    expect(p.ligands.map((l) => l.name)).toContain('ZN')
    expect(p.bfactor).toHaveLength(p.mol.atoms.length)
    expect(fasta(p, 'demo')).toMatch(/^>demo\|chain A\nKVTVEV/)
  })
  it('demo geometry is sane: consecutive CAs ~3.8 Å, paired strands ~4.4–5.6 Å', () => {
    const p = parseProtein(demoProteinPdb())
    const ca = (c: string, n: number) => { const r = p.residues.find((x) => x.chain === c && x.seq === n)!; const a = p.mol.atoms[r.ca]; return [a.x, a.y, a.z] as [number, number, number] }
    for (let i = 1; i < 6; i++) expect(dist(ca('A', i), ca('A', i + 1))).toBeCloseTo(3.8, 0)
    const d = dist(ca('A', 3), ca('A', 12))
    expect(d).toBeGreaterThan(4.2)
    expect(d).toBeLessThan(6)
  })
  it('estimates secondary structure without records', () => {
    const text = demoProteinPdb().split('\n').filter((l) => !/^(HELIX|SHEET)/.test(l)).join('\n')
    const p = parseProtein(text)
    expect(p.ssSource).toBe('estimated')
    const helixRes = p.residues.filter((r) => r.ss === 'H').length
    const strandRes = p.residues.filter((r) => r.ss === 'E').length
    expect(helixRes).toBeGreaterThan(30)
    expect(strandRes).toBeGreaterThan(8)
  })
  it('sequence mass', () => {
    expect(seqMass('G')).toBeCloseTo(75.07, 1)
  })
})
