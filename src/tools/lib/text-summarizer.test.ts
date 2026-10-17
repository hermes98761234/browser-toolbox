import { describe, expect, it } from 'vitest'
import { cosine, pageRank, splitSentences, stem, summarize, terms, tfidf } from './text-summarizer'

describe('text summarizer', () => {
  it('splits sentences around abbreviations, initials and decimals', () => {
    const s = splitSentences('Dr. Smith paid $3.50 for it. J. R. R. Tolkien wrote books! Did the U.S. economy grow? Yes, e.g. by 2.1%.\n\nNew paragraph here')
    expect(s).toEqual(['Dr. Smith paid $3.50 for it.', 'J. R. R. Tolkien wrote books!', 'Did the U.S. economy grow?', 'Yes, e.g. by 2.1%.', 'New paragraph here'])
  })
  it('stems and drops stop words', () => {
    expect(stem('cities')).toBe('city')
    expect(stem('running')).toBe('run')
    expect(stem('walked')).toBe('walk')
    expect(terms('The cats are running quickly')).toEqual(['cat', 'run', 'quick'])
  })
  it('tf-idf and cosine', () => {
    const { vecs } = tfidf([['solar', 'panel'], ['solar', 'panel'], ['wind', 'turbine']])
    expect(cosine(vecs[0], vecs[1])).toBeCloseTo(1)
    expect(cosine(vecs[0], vecs[2])).toBe(0)
  })
  it('pagerank sums to 1 and favours the hub', () => {
    const r = pageRank([[0, 1, 1], [1, 0, 0], [1, 0, 0]])
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
    expect(r[0]).toBeGreaterThan(r[1])
    expect(r[1]).toBeCloseTo(r[2], 9)
  })
  it('picks central sentences, preserves order and avoids duplicates with MMR', () => {
    const text = 'Solar power is growing fast worldwide. Solar panels convert sunlight into electricity. My cat likes naps. Solar power is growing fast worldwide! Cheap solar panels make solar electricity affordable.'
    for (const method of ['tfidf', 'textrank'] as const) {
      const r = summarize(text, { method, count: 2, lead: false, mmr: true })
      expect(r.chosen).toHaveLength(2)
      expect(r.chosen).not.toContain(2)
      expect(r.chosen[0]).toBeLessThan(r.chosen[1])
      // MMR should not pick both copies of the duplicated sentence
      expect(r.chosen.includes(0) && r.chosen.includes(3)).toBe(false)
    }
    expect(summarize(text, { method: 'tfidf', count: 2, lead: false, mmr: false }).keywords[0][0]).toBe('solar')
  })
})
