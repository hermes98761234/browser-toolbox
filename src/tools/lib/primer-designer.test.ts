import { describe, expect, it } from 'vitest'
import { analyze, DEFAULT_COND, DEFAULT_SETTINGS, design, dimer, gc, hairpin, revComp, SAMPLE_TEMPLATE, thermo, tm } from './primer-designer'

describe('primer-designer', () => {
  it('nearest-neighbour sums', () => {
    // CGTTGA: CG + GT + TT + TG + GA + init(G/C) + init(A/T)
    const t = thermo('CGTTGA')
    expect(t.dH).toBeCloseTo(-10.6 - 8.4 - 7.9 - 8.5 - 8.2 + 0.1 + 2.3, 6)
    expect(t.dS).toBeCloseTo(-27.2 - 22.4 - 22.2 - 22.7 - 22.2 - 2.8 + 4.1, 6)
  })
  it('Tm is in the expected range and responds to salt and concentration', () => {
    const p = 'AGCGGATAACAATTTCACACAGGA' // M13 reverse, ~60 °C in typical calculators
    const t = tm(p, { na: 50, mg: 0, dntp: 0, primerNM: 250 })
    expect(t).toBeGreaterThan(56)
    expect(t).toBeLessThan(63)
    expect(tm(p, { ...DEFAULT_COND, mg: 3 })).toBeGreaterThan(tm(p, { ...DEFAULT_COND, mg: 0 }))
    expect(tm(p, { ...DEFAULT_COND, primerNM: 1000 })).toBeGreaterThan(tm(p))
    expect(gc('GGCC')).toBe(1)
  })
  it('detects hairpins and dimers', () => {
    expect(hairpin('GGGCCCAAAAGGGCCC').dG).toBeLessThan(-3)
    expect(hairpin('ATATATATAT').stem).toBeGreaterThanOrEqual(0)
    const d = dimer('ACGTACGTGAATTC', 'ACGTACGTGAATTC')
    expect(d.dG).toBeLessThan(-5)
    expect(d.mid).toContain('|||')
    expect(dimer('AAAAAAAA', 'AAAAAAAA').dG).toBe(0)
    expect(revComp('AACG')).toBe('CGTT')
  })
  it('flags poor primers and designs pairs on the sample', () => {
    expect(analyze('AAAAATTTTTAAAAA').warnings.length).toBeGreaterThan(1)
    const pairs = design(SAMPLE_TEMPLATE, { ...DEFAULT_SETTINGS, tmOpt: 62, tmMin: 57, tmMax: 67 }, DEFAULT_COND)
    expect(pairs.length).toBeGreaterThan(0)
    const p = pairs[0]
    expect(p.product).toBeGreaterThanOrEqual(200)
    expect(p.product).toBeLessThanOrEqual(500)
    expect(SAMPLE_TEMPLATE.includes(p.fwd.seq)).toBe(true)
    expect(SAMPLE_TEMPLATE.includes(revComp(p.rev.seq))).toBe(true)
  })
})
