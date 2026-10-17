import { describe, expect, it } from 'vitest'
import { analyze, freBand, isComplex, sentences, syllables } from './readability-scorer'

describe('readability-scorer', () => {
  it('counts syllables', () => {
    const cases: [string, number][] = [['the', 1], ['cat', 1], ['make', 1], ['table', 2], ['syllable', 3], ['readability', 5], ['beautiful', 3], ['created', 3], ['jumped', 1], ['wanted', 2], ['radio', 3], ['nation', 2], ['simple', 2], ['every', 2], ['communication', 5], ['understanding', 4]]
    for (const [w, n] of cases) expect([w, syllables(w)]).toEqual([w, n])
  })
  it('splits sentences around abbreviations and decimals', () => {
    const s = sentences('Dr. Smith paid $3.50 for tea. Was it good? Yes!')
    expect(s.map((x) => x.words.length)).toEqual([5, 3, 1])
  })
  it('flags complex words', () => {
    expect(isComplex('beautiful', false)).toBe(true)
    expect(isComplex('Australia', false)).toBe(false)
    expect(isComplex('self-employed', false)).toBe(false)
    expect(isComplex('cat', true)).toBe(false)
  })
  it('scores simple text as easy', () => {
    const r = analyze('The cat sat on the mat. The dog ran to the park.')
    expect(r.words).toBe(12)
    expect(r.sentences).toBe(2)
    // FRE = 206.835 − 1.015·6 − 84.6·1 = 116.145
    expect(r.fre).toBeCloseTo(116.145, 6)
    expect(r.fk).toBeCloseTo(0.39 * 6 + 11.8 - 15.59, 6)
    expect(freBand(r.fre)[0]).toBe('Very easy')
  })
})
