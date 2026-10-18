import { describe, expect, it } from 'vitest'
import { classify, compare, lcsDiff, levenshtein, score, tokenize } from './dictation-checker'

describe('dictation-checker', () => {
  it('tokenizes words and punctuation', () => {
    expect(tokenize("Don't stop, well-known 42!").map((t) => t.text)).toEqual(["Don't", 'stop', ',', 'well-known', '42', '!'])
    expect(tokenize('Hi, there.', true).map((t) => t.text)).toEqual(['Hi', 'there'])
  })
  it('diffs with LCS', () => {
    const a = tokenize('a b c d')
    const b = tokenize('a c x d')
    const ops = lcsDiff(a, b, (t) => t.text).map((o) => o.op)
    expect(ops.filter((o) => o === 'eq').length).toBe(3)
    expect(levenshtein('kitten', 'sitting')).toBe(3)
  })
  it('classifies errors and scores', () => {
    expect(classify('Paris', 'paris')).toBe('capitalization')
    expect(classify('receive', 'recieve')).toBe('spelling')
    expect(classify('house', 'garden')).toBe('wrong word')
    const p = compare('The quick fox jumps, then rests.', 'the quik fox jumps then rests now.', { ignoreCase: false, ignorePunct: false })
    const s = score(p, true)
    expect(s.words).toBe(6)
    expect(s.errors.capitalization).toBe(1)
    expect(s.errors.spelling).toBe(1)
    expect(s.errors.punctuation).toBe(1)
    expect(s.errors.extra).toBe(1)
    expect(s.correct).toBe(4)
    expect(s.weighted).toBe(3)
    expect(s.score).toBeCloseTo(0.5, 10)
    const q = score(compare('One two three', 'one two', { ignoreCase: true, ignorePunct: true }), false)
    expect(q.errors.missing).toBe(1)
    expect(q.accuracy).toBeCloseTo(2 / 3, 10)
  })
})
