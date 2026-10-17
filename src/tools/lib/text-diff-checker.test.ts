import { describe, expect, it } from 'vitest'
import { chars, diff, keyFn, lines, sideBySide, stats, unified, words, type Chunk } from './text-diff-checker'

const apply = (cs: Chunk[], side: '-' | '+') => cs.filter((c) => c.op === '=' || c.op === side).flatMap((c) => c.items).join('')
const minEdits = (cs: Chunk[]) => cs.filter((c) => c.op !== '=').reduce((n, c) => n + c.items.length, 0)

describe('text-diff-checker', () => {
  it('finds a minimal edit script', () => {
    const cs = diff(chars('ABCABBA'), chars('CBABAC'))
    expect(minEdits(cs)).toBe(5) // classic Myers example: D = 5
    expect(apply(cs, '-')).toBe('ABCABBA')
    expect(apply(cs, '+')).toBe('CBABAC')
  })
  it('handles empty and identical inputs', () => {
    expect(diff([], ['a'])).toEqual([{ op: '+', items: ['a'] }])
    expect(diff(['a'], [])).toEqual([{ op: '-', items: ['a'] }])
    expect(diff(['x', 'y'], ['x', 'y'])).toEqual([{ op: '=', items: ['x', 'y'] }])
  })
  it('reconstructs both sides for random inputs', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    for (let t = 0; t < 50; t++) {
      const a = Array.from({ length: Math.floor(rnd() * 30) }, () => 'abcd'[Math.floor(rnd() * 4)]).join('')
      const b = Array.from({ length: Math.floor(rnd() * 30) }, () => 'abcd'[Math.floor(rnd() * 4)]).join('')
      const cs = diff(chars(a), chars(b))
      expect(apply(cs, '-')).toBe(a)
      expect(apply(cs, '+')).toBe(b)
    }
  })
  it('tokenizes words losslessly and ignores case/whitespace on request', () => {
    expect(words('Hello,  world!').join('')).toBe('Hello,  world!')
    expect(words('Hello,  world!')).toEqual(['Hello', ',', '  ', 'world', '!'])
    expect(diff(['Foo  bar'], ['foo bar'], keyFn(true, true))[0].op).toBe('=')
    expect(lines('a\r\nb\n')).toEqual(['a', 'b', ''])
  })
  it('aligns side by side and writes unified diffs', () => {
    const cs = diff(lines('a\nb\nc\nd'), lines('a\nB\nc\nd\ne'))
    const rows = sideBySide(cs)
    expect(rows.map((r) => r.kind)).toEqual(['same', 'change', 'same', 'same', 'add'])
    expect(unified(cs, 'old', 'new', 1)).toBe('--- old\n+++ new\n@@ -1,4 +1,5 @@\n a\n-b\n+B\n c\n d\n+e\n')
    expect(stats(cs).similarity).toBeCloseTo((2 * 3) / (2 * 3 + 1 + 2), 9)
  })
})
