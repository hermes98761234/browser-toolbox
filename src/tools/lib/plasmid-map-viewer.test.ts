import { describe, expect, it } from 'vitest'
import { findSites } from './dna-sequence-toolkit'
import { featureSeq, lanes, parseAny, parseGenBank, parseLocation, sampleGenBank, span, spreadAngles } from './plasmid-map-viewer'

describe('plasmid map viewer', () => {
  it('parses GenBank locations', () => {
    expect(parseLocation('100..200')).toEqual({ segs: [[100, 200]], strand: 1 })
    expect(parseLocation('complement(<5..>50)')).toEqual({ segs: [[5, 50]], strand: -1 })
    expect(parseLocation('join(1..10,20..30)')).toEqual({ segs: [[1, 10], [20, 30]], strand: 1 })
    expect(parseLocation('complement(join(2600..2686,1..40))')?.strand).toBe(-1)
    expect(parseLocation('join(complement(5..9),complement(1..3))')?.strand).toBe(-1)
    expect(parseLocation('12')).toEqual({ segs: [[12, 12]], strand: 1 })
    expect(parseLocation('bogus')).toBeNull()
  })
  it('parses a GenBank record with multi-line qualifiers', () => {
    const gb = `LOCUS       pTEST   30 bp    DNA     circular
DEFINITION  test
            plasmid.
FEATURES             Location/Qualifiers
     source          1..30
     CDS             complement(4..15)
                     /gene="bla"
                     /note="a long
                     note"
     misc_feature    join(25..30,1..3)
ORIGIN
        1 atgaaaccca tgggtttaaa cccgggaaat
//`
    const r = parseGenBank(gb)
    expect(r.name).toBe('pTEST')
    expect(r.circular).toBe(true)
    expect(r.definition).toBe('test plasmid.')
    expect(r.length).toBe(30)
    expect(r.features.length).toBe(2)
    expect(r.features[0]).toMatchObject({ type: 'CDS', label: 'bla', strand: -1, segs: [[4, 15]] })
    expect(r.features[0].quals.note).toBe('a long note')
    expect(featureSeq(r.features[0], r.seq)).toBe('ACCCATGGGTTT') // revcomp of AAACCCATGGGT
    expect(span(r.features[1], 30)).toEqual({ start: 25, size: 9 })
    expect(featureSeq(r.features[1], r.seq)).toBe('GGAAATATG')
  })
  it('builds the demo vector with unique MCS sites', () => {
    const r = parseGenBank(sampleGenBank())
    expect(r.features.map((f) => f.label)).toContain('AmpR')
    expect(r.warnings).toEqual([])
    const hits = findSites(r.seq, undefined, true)
    for (const e of ['EcoRI', 'BamHI', 'HindIII', 'PstI', 'XbaI']) expect(hits.filter((h) => h.enzyme === e).length).toBe(1)
    const amp = r.features.find((f) => f.label === 'AmpR')!
    expect(featureSeq(amp, r.seq).startsWith('ATG')).toBe(true)
  })
  it('falls back to FASTA', () => {
    const r = parseAny('>x demo\nACGTACGT')
    expect(r.seq).toBe('ACGTACGT')
    expect(r.features).toEqual([])
  })
  it('assigns lanes to overlapping features', () => {
    const f = (a: number, b: number) => ({ type: 'x', label: '', strand: 1 as const, segs: [[a, b]] as [number, number][], quals: {} })
    const l = lanes([f(1, 100), f(50, 150), f(200, 300)], 1000)
    expect(l[0]).not.toBe(l[1])
    expect(l[2]).toBe(0)
  })
  it('spreads crowded labels', () => {
    const out = spreadAngles([1, 1.01, 1.02], 0.1)
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(0.0999)
    expect(out[2] - out[1]).toBeGreaterThanOrEqual(0.0999)
  })
})

describe('column labels', () => {
  it('stacks labels on each side without overlap', async () => {
    const { columnLabels } = await import('./plasmid-map-viewer')
    const pts = columnLabels([-1.5, -1.49, -1.48, 2, 2.01], 300, 300, 200, 13)
    expect(pts[0].right && pts[1].right && pts[2].right).toBe(true)
    expect(pts[1].y - pts[0].y).toBeGreaterThanOrEqual(13)
    expect(pts[2].y - pts[1].y).toBeGreaterThanOrEqual(13)
    expect(pts[3].right).toBe(false)
  })
})
