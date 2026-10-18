import { describe, expect, it } from 'vitest'
import { focus, level, ngrams, sentencesOfWords } from './keyword-density-analyzer'

const O = { stop: true, minLen: 2, numbers: false, extraStop: [] }

describe('keyword density', () => {
  const text = 'Cold brew coffee is smooth. Cold brew coffee needs time! A cup of tea is fine.'
  it('tokenises by sentence', () => {
    expect(sentencesOfWords("It's a test. Next one")).toEqual([["it's", 'a', 'test'], ['next', 'one']])
  })
  it('counts unigrams without stop words', () => {
    const { grams, total } = ngrams(text, 1, O)
    expect(total).toBe(16)
    const cold = grams.find((g) => g.phrase === 'cold')!
    expect(cold.count).toBe(2)
    expect(cold.density).toBeCloseTo(2 / 16, 9)
    expect(grams.some((g) => g.phrase === 'is')).toBe(false)
  })
  it('phrases may hold inner stop words but not cross sentences', () => {
    const tri = ngrams(text, 3, O).grams
    expect(tri.find((g) => g.phrase === 'cold brew coffee')!.count).toBe(2)
    expect(tri.some((g) => g.phrase === 'cup of tea')).toBe(true)
    expect(tri.some((g) => g.phrase === 'smooth cold brew')).toBe(false)
    expect(ngrams(text, 2, O).grams.find((g) => g.phrase === 'cold brew')!.density).toBeCloseTo(4 / 16, 9)
  })
  it('focus keyword', () => {
    const f = focus(text, 'Cold Brew')
    expect(f.count).toBe(2)
    expect(f.firstAt).toBe(0)
    expect(level(0.01)).toBe('ok')
    expect(level(0.05)).toBe('high')
  })
})
