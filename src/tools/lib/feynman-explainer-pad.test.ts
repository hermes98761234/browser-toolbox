import { describe, expect, it } from 'vitest'
import { analyze, flagOf, flagged, freLabel, sentencesOf, syllables, tokenize } from './feynman-explainer-pad'

const O = { custom: ['spike'], acronyms: true, long: true, longSyl: 4 }

describe('syllables', () => {
  it('counts common words', () => {
    const cases: [string, number][] = [['cat', 1], ['the', 1], ['hello', 2], ['water', 2], ['table', 2], ['makes', 1], ['computer', 3], ['banana', 3], ['readability', 5], ['photosynthesis', 5]]
    for (const [w, n] of cases) expect(syllables(w), w).toBe(n)
  })
})

describe('readability', () => {
  it('applies Flesch formulas', () => {
    const s = analyze('The cat sat on the mat. The dog ran.')
    expect(s.words).toBe(9)
    expect(s.sentences).toBe(2)
    expect(s.syllables).toBe(9)
    expect(s.fre).toBeCloseTo(206.835 - 1.015 * 4.5 - 84.6, 6)
    expect(s.fk).toBeCloseTo(0.39 * 4.5 + 11.8 - 15.59, 6)
    expect(freLabel(s.fre)).toBe('Very easy (age 11)')
  })
  it('splits sentences and finds long ones', () => {
    expect(sentencesOf('One. Two! Three?\n\nFour')).toEqual(['One.', 'Two!', 'Three?', 'Four'])
    const long = Array(30).fill('word').join(' ') + '.'
    expect(analyze(long).longSentences).toHaveLength(1)
    expect(analyze('').fre).toBe(0)
  })
})

describe('flags', () => {
  it('marks jargon, custom terms, acronyms and long words but keeps every character', () => {
    const t = 'We leverage a mRNA and DNA spike, OK? Extraordinarily simple.'
    const toks = tokenize(t, O)
    expect(toks.map((x) => x[0]).join('')).toBe(t)
    const f = Object.fromEntries(toks.filter((x) => x[1]).map((x) => [x[0], x[1]]))
    expect(f).toEqual({ leverage: 'jargon', DNA: 'acronym', spike: 'jargon', Extraordinarily: 'long' })
    expect(flagOf('leverages', O, new Set())).toBe('jargon')
    expect(flagOf('optimizing', O, new Set())).toBe('jargon')
    expect(flagged('DNA and DNA leverage', O)).toEqual([{ term: 'leverage', flag: 'jargon', count: 1 }, { term: 'DNA', flag: 'acronym', count: 2 }])
  })
})
