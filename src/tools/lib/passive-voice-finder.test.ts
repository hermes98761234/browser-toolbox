import { describe, expect, it } from 'vitest'
import { analyze, flesch, sentences, syllables } from './passive-voice-finder'

describe('passive voice', () => {
  it('finds passives with agents', () => {
    const h = analyze('The report was written by the committee. Mistakes were made.')
    const p = h.filter((x) => x.kind === 'passive')
    expect(p.map((x) => x.text)).toEqual(['was written by the committee', 'were made'])
    expect(p[0].agent).toBe('the committee')
  })
  it('allows adverbs in between and get-passives', () => {
    const h = analyze('The bug has been quickly fixed. He got fired.').filter((x) => x.kind === 'passive')
    expect(h.map((x) => x.text)).toEqual(['been quickly fixed', 'got fired'])
  })
  it('marks adjectival forms and ignores active voice', () => {
    expect(analyze('I am tired.')[0].kind).toBe('adjectival')
    expect(analyze('It had been badly prepared.')[0].kind).toBe('passive')
    expect(analyze('She wrote the report.').filter((x) => x.kind === 'passive')).toHaveLength(0)
    expect(analyze('It is red.').filter((x) => x.kind === 'passive')).toHaveLength(0)
  })
  it('weak adverbs and hedges', () => {
    const h = analyze('It is really quite simply amazing, I think. Only the family came.')
    expect(h.filter((x) => x.kind === 'adverb').map((x) => x.text)).toEqual(['really', 'quite', 'simply'])
    expect(h.some((x) => x.kind === 'hedge' && x.text === 'I think')).toBe(true)
  })
  it('readability helpers', () => {
    expect(sentences('One. Two! Three?')).toHaveLength(3)
    expect(syllables('readability')).toBeGreaterThanOrEqual(4)
    expect(flesch('The cat sat on the mat.')).toBeGreaterThan(90)
  })
})
