import { describe, expect, it } from 'vitest'
import { codonAA, composition, digest, findOrfs, findSites, formatSeq, gcWindows, meltingTemp, molecularWeight, parseFasta, reverseComplement, sampleSequence, translate } from './dna-sequence-toolkit'

describe('dna toolkit', () => {
  it('parses FASTA and plain text', () => {
    const r = parseFasta('>a desc here\nACGT\nacgu\n>b\nGG CC 10\n')
    expect(r).toEqual([{ id: 'a', desc: 'desc here', seq: 'ACGTACGT' }, { id: 'b', desc: '', seq: 'GGCC' }])
    expect(parseFasta('atg\ncc')[0].seq).toBe('ATGCC')
  })
  it('reverse complement with IUPAC', () => {
    expect(reverseComplement('ATGCRYN')).toBe('NRYGCAT')
    expect(reverseComplement('GAATTC')).toBe('GAATTC')
  })
  it('translates with genetic codes', () => {
    expect(translate('ATGGCCTAA')).toBe('MA*')
    expect(translate('AATGGCC', 1)).toBe('MA')
    expect(codonAA('TGA', 1)).toBe('*')
    expect(codonAA('TGA', 2)).toBe('W')
    expect(codonAA('AGA', 2)).toBe('*')
    expect(codonAA('TAA', 6)).toBe('Q')
    expect(codonAA('NNN')).toBe('X')
  })
  it('composition, Tm and MW', () => {
    const c = composition('AACCGGTT')
    expect(c.gc).toBe(0.5)
    expect(meltingTemp('AACCGGTT')).toBe(24)
    expect(meltingTemp('ACGTACGTACGTACGTACGT')).toBeCloseTo(64.9 + (41 * (10 - 16.4)) / 20, 9)
    expect(molecularWeight('A').ss).toBeCloseTo(313.21 - 61.96, 6)
    expect(gcWindows('GGGGAAAA', 4, 4)).toEqual([[2, 1], [6, 0]])
  })
  it('finds ORFs on both strands', () => {
    const orf = 'ATG' + 'GCT'.repeat(60) + 'TAA'
    const seq = 'CC' + orf + 'GG'
    const f = findOrfs(seq, 50)
    expect(f[0]).toMatchObject({ strand: 1, frame: 3, start: 3, end: 3 + orf.length - 1, aa: 61 })
    expect(f[0].protein).toBe('M' + 'A'.repeat(60))
    const r = findOrfs(reverseComplement(seq), 50)
    expect(r[0]).toMatchObject({ strand: -1, start: 3, end: 3 + orf.length - 1 })
  })
  it('restriction sites and digest', () => {
    const seq = 'AAAGAATTCAAAAGGATCCAAA'
    const h = findSites(seq)
    const eco = h.find((x) => x.enzyme === 'EcoRI')!
    expect(eco.pos).toBe(4)
    expect(eco.cut).toBe(4) // G^AATTC → cut after base 4
    const bam = h.find((x) => x.enzyme === 'BamHI')!
    expect(bam.cut).toBe(14)
    expect(digest(seq.length, [eco.cut, bam.cut])).toEqual([10, 8, 4])
    expect(digest(100, [10, 60], true)).toEqual([50, 50])
    // non-palindromic BsaI on the bottom strand
    const b = findSites('AAAAGAGACCAAAAAAAAAAAAA').filter((x) => x.enzyme === 'BsaI')
    expect(b).toHaveLength(1)
    expect(b[0].strand).toBe(-1)
  })
  it('sample contains a long ORF and the cloning sites', () => {
    const s = sampleSequence()
    expect(findOrfs(s, 100)[0].aa).toBe(120)
    const names = new Set(findSites(s).map((h) => h.enzyme))
    for (const e of ['EcoRI', 'BamHI', 'HindIII', 'XhoI', 'NotI']) expect(names.has(e)).toBe(true)
    expect(formatSeq('A'.repeat(25), 20)).toBe(' 1  AAAAAAAAAA AAAAAAAAAA\n21  AAAAA')
  })
})
