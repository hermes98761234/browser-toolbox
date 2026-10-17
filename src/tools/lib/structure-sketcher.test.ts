import { describe, expect, it } from 'vitest'
import { descriptors, formula, kekulize, layout, masses, parseSmiles, writeSmiles } from './structure-sketcher'

const props = (s: string) => {
  const m = parseSmiles(s)
  return { f: formula(m).text, ...masses(m), ...descriptors(m) }
}

describe('structure sketcher', () => {
  it('aspirin', () => {
    const p = props('CC(=O)Oc1ccccc1C(=O)O')
    expect(p.f).toBe('C9H8O4')
    expect(p.avg).toBeCloseTo(180.159, 2)
    expect(p.mono).toBeCloseTo(180.042259, 5)
    expect(p.hbd).toBe(1)
    expect(p.hba).toBe(4)
    expect(p.tpsa).toBeCloseTo(63.6, 1)
    expect(p.rings).toBe(1)
    expect(p.dbe).toBe(6)
  })
  it('caffeine and paracetamol', () => {
    expect(props('Cn1cnc2c1c(=O)n(C)c(=O)n2C').f).toBe('C8H10N4O2')
    const p = props('CC(=O)Nc1ccc(O)cc1')
    expect(p.f).toBe('C8H9NO2')
    expect(p.tpsa).toBeCloseTo(49.33, 2)
    expect(p.hbd).toBe(2)
  })
  it('brackets, charges, pyrrole, isotopes', () => {
    expect(formula(parseSmiles('[NH4+]')).text).toBe('H4N+')
    expect(formula(parseSmiles('C(=O)[O-]')).text).toBe('CHO2−')
    expect(formula(parseSmiles('c1cc[nH]c1')).text).toBe('C4H5N')
    expect(formula(parseSmiles('[13CH4]')).text).toBe('CH4')
    expect(formula(parseSmiles('ClCCl')).text).toBe('CH2Cl2')
  })
  it('rejects bad SMILES', () => {
    expect(() => parseSmiles('C1CC')).toThrow()
    expect(() => parseSmiles('C(C')).toThrow()
    expect(() => parseSmiles('CXC')).toThrow()
  })
  it('round-trips through the writer', () => {
    for (const s of ['CC(=O)Oc1ccccc1C(=O)O', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', 'C1CCC2CCCCC2C1', 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O', 'c1cc[nH]c1', 'C#N', '[Na+].[Cl-]']) {
      const m = parseSmiles(s)
      expect(formula(parseSmiles(writeSmiles(m))).text).toBe(formula(m).text)
      const k = kekulize(m)
      expect(formula(k).text).toBe(formula(m).text)
      expect(formula(parseSmiles(writeSmiles(k))).text).toBe(formula(m).text)
    }
  })
  it('lays out benzene as a regular hexagon', () => {
    const m = parseSmiles('c1ccccc1')
    layout(m)
    for (const b of m.bonds) expect(Math.hypot(m.atoms[b.a].x - m.atoms[b.b].x, m.atoms[b.a].y - m.atoms[b.b].y)).toBeCloseTo(1, 1)
  })
})
