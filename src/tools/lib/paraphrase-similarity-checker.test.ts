import { describe, expect, it } from 'vitest'
import { alignSentences, compare, containment, copiedPhrases, diffWords, jaccard, lcsLength, orderSimilarity, rougeL, stem, terms, tfidfCosine } from './paraphrase-similarity-checker'

const o = { synonyms: true, stopwords: false }

describe('paraphrase-similarity-checker', () => {
  it('normalizes words', () => {
    expect(stem('studies')).toBe('study')
    expect(stem('running')).toBe('runn')
    expect(stem('class')).toBe('class')
    expect(terms('The researchers utilize huge datasets', o)).toEqual(['researcher', 'use', 'big', 'dataset'])
  })
  it('computes set measures', () => {
    expect(jaccard(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5)
    expect(containment(['a', 'b'], ['a', 'a', 'x', 'b'])).toBeCloseTo(0.5)
    expect(lcsLength('abcbdab'.split(''), 'bdcaba'.split(''))).toBe(4)
    expect(rougeL(['a', 'b', 'c', 'd'], ['a', 'c', 'd'])).toBeCloseTo((2 * 1 * 0.75) / 1.75)
    expect(orderSimilarity(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(0)
    expect(orderSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1)
    expect(tfidfCosine(['x', 'y'], ['x', 'y'], [['x', 'y']])).toBeCloseTo(1)
    expect(tfidfCosine(['x'], ['y'], [['x'], ['y']])).toBe(0)
  })
  it('ranks copies above rewrites', () => {
    const src = 'Regular exercise improves heart health and reduces the risk of many chronic diseases.'
    const same = compare(src, src, o)
    expect(same.overall).toBeCloseTo(1, 1)
    expect(same.verdict).toBe('Near copy')
    const light = compare(src, 'Regular exercise improves heart health and lowers the risk of several chronic diseases.', o)
    const deep = compare(src, 'Working out often keeps your cardiovascular system strong and makes long-term illness less likely.', o)
    expect(light.overall).toBeGreaterThan(deep.overall)
    expect(deep.verdict).toBe('Substantially reworded')
  })
  it('diffs and finds copied phrases', () => {
    const ops = diffWords('the quick brown fox', 'the slow brown fox')
    expect(ops).toEqual([{ t: 'eq', s: 'the' }, { t: 'del', s: 'quick' }, { t: 'add', s: 'slow' }, { t: 'eq', s: 'brown fox' }])
    expect(copiedPhrases('one two three four five six', 'zero two three four five nine')).toEqual(['two three four five'])
    const al = alignSentences('Cats sleep a lot. Dogs bark loudly.', 'Dogs bark very loudly.', o)
    expect(al[0].source).toBe('Dogs bark loudly.')
  })
})
